package order

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"

	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
)

type OrderConsumers struct {
	service *Service
	cg      *kafkapkg.ConsumerGroup
}

func NewOrderConsumers(brokers []string, service *Service) (*OrderConsumers, error) {
	oc := &OrderConsumers{service: service}

	handlers := map[string]kafkapkg.MessageHandler{
		kafkapkg.TopicSolanaDepositLocked: oc.handleDepositLocked,
		kafkapkg.TopicSolanaPartySigned:   oc.handlePartySigned,
		kafkapkg.TopicSolanaEscrowExpired: oc.handleEscrowExpired,
		kafkapkg.TopicSolanaRentPaid:      oc.handleRentPaid,
	}

	cg, err := kafkapkg.NewConsumerGroup(brokers, "order-solana-consumer", handlers)
	if err != nil {
		return nil, err
	}

	oc.cg = cg
	return oc, nil
}

func (oc *OrderConsumers) Start(ctx context.Context) {
	oc.cg.Start(ctx)
	log.Println("[order-consumers] Solana event consumers started")
}

func (oc *OrderConsumers) Close() error {
	return oc.cg.Close()
}

func (oc *OrderConsumers) handleDepositLocked(_ string, value []byte) error {
	var evt kafkapkg.SolanaDepositLockedEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	orderID, err := uuid.FromBytes(evt.OrderId)
	if err != nil {
		log.Printf("[order-consumer] invalid order_id in deposit_locked event: %v", err)
		return nil
	}

	o, err := oc.service.store.GetByID(orderID.String())
	if err != nil {
		log.Printf("[order-consumer] no order for id %s: %v", orderID, err)
		return nil
	}

	if o.EscrowStatus != StatusAwaitingDeposit {
		log.Printf("[order-consumer] order %s not in awaiting_deposit (is %s), skipping", o.ID, o.EscrowStatus)
		return nil
	}

	if err := oc.service.store.UpdateStatus(o.ID, StatusAwaitingSignatures, "system", "deposit locked on-chain"); err != nil {
		return err
	}
	o.EscrowStatus = StatusAwaitingSignatures

	if err := oc.service.store.UpdateEscrowAddress(o.ID, evt.Escrow); err != nil {
		return err
	}
	o.EscrowAddress = evt.Escrow

	oc.service.publishCentrifugoOrderUpdate(o, "deposit_locked", evt.TxSignature)
	oc.service.publishOrderEvent(kafkapkg.TopicOrderCreated, o)

	log.Printf("[order-consumer] deposit locked for order %s (tx: %s), now awaiting_signatures", o.ID, evt.TxSignature)
	return nil
}

func (oc *OrderConsumers) handlePartySigned(_ string, value []byte) error {
	var evt kafkapkg.SolanaPartySignedEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	o, err := oc.service.store.FindByEscrowAddress(evt.Escrow)
	if err != nil {
		log.Printf("[order-consumer] no order for escrow %s: %v", evt.Escrow, err)
		return nil
	}

	if o.EscrowStatus != StatusAwaitingSignatures {
		log.Printf("[order-consumer] order %s not in awaiting_signatures (is %s), skipping", o.ID, o.EscrowStatus)
		return nil
	}

	switch evt.Role {
	case "tenant":
		if err := oc.service.store.UpdateTenantSigned(o.ID, true); err != nil {
			return err
		}
		o.TenantSignedOnchain = true
	case "landlord":
		if err := oc.service.store.UpdateLandlordSigned(o.ID, true); err != nil {
			return err
		}
		o.LandlordSignedOnchain = true
	default:
		log.Printf("[order-consumer] unknown role %s for escrow %s", evt.Role, evt.Escrow)
		return nil
	}

	signEvt := kafkapkg.OrderSignedEvent{
		EventID:        uuid.New().String(),
		OrderID:        o.ID,
		PropertyID:     o.PropertyID,
		TenantWallet:   o.TenantID,
		LandlordWallet: o.LandlordID,
		SignedBy:       evt.Signer,
		Role:           evt.Role,
		BothSigned:     o.TenantSignedOnchain && o.LandlordSignedOnchain,
		Timestamp:      time.Now(),
	}
	oc.service.producer.Publish(context.Background(), kafkapkg.TopicOrderSigned, o.ID, signEvt)
	oc.service.publishCentrifugoOrderUpdate(o, "party_signed", evt.TxSignature)

	if o.TenantSignedOnchain && o.LandlordSignedOnchain {
		if err := oc.service.store.UpdateStatus(o.ID, StatusActive, "system", "both parties signed on-chain"); err != nil {
			return err
		}
		o.EscrowStatus = StatusActive
		oc.service.publishOrderEvent(kafkapkg.TopicOrderActivated, o)
		oc.service.publishCentrifugoOrderUpdate(o, "order_activated", evt.TxSignature)
		log.Printf("[order-consumer] order %s activated — both parties signed (tx: %s)", o.ID, evt.TxSignature)
	} else {
		log.Printf("[order-consumer] %s signed order %s (tx: %s)", evt.Role, o.ID, evt.TxSignature)
	}

	return nil
}

func (oc *OrderConsumers) handleRentPaid(_ string, value []byte) error {
	var evt kafkapkg.SolanaRentPaidEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	o, err := oc.service.store.FindByEscrowAddress(evt.Escrow)
	if err != nil {
		log.Printf("[order-consumer] no order for escrow %s: %v", evt.Escrow, err)
		return nil
	}

	payment := &RentPayment{
		OrderID:     o.ID,
		PaidAt:      time.Unix(evt.PaidAt, 0).UTC(),
		Transaction: evt.TxSignature,
		PaidAmount:  int64(evt.Amount),
	}
	if _, err := oc.service.store.AddRentPayment(payment); err != nil {
		return err
	}

	oc.service.publishCentrifugoOrderUpdate(o, "rent_paid", evt.TxSignature)
	log.Printf("[order-consumer] rent paid for order %s amount=%d (tx: %s)", o.ID, evt.Amount, evt.TxSignature)
	return nil
}

func (oc *OrderConsumers) handleEscrowExpired(_ string, value []byte) error {
	var evt kafkapkg.SolanaEscrowExpiredEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	o, err := oc.service.store.FindByEscrowAddress(evt.Escrow)
	if err != nil {
		log.Printf("[order-consumer] no order for escrow %s: %v", evt.Escrow, err)
		return nil
	}

	if err := oc.service.store.UpdateStatus(o.ID, StatusExpired, "system", "escrow expired on-chain"); err != nil {
		return err
	}
	o.EscrowStatus = StatusExpired

	oc.service.publishOrderEvent(kafkapkg.TopicOrderExpired, o)
	oc.service.publishCentrifugoOrderUpdate(o, "order_expired", evt.TxSignature)

	log.Printf("[order-consumer] order %s expired (tx: %s)", o.ID, evt.TxSignature)
	return nil
}
