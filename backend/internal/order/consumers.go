package order

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/google/uuid"

	"github.com/abdro/decentrarent/backend/internal/chat"
	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
	"github.com/abdro/decentrarent/backend/internal/property"
)

var periodSeconds = map[string]int64{
	"hour":  3600,
	"day":   86400,
	"week":  604800,
	"month": 2592000,
}

type OrderConsumers struct {
	chatSvc       *chat.Service
	service       *Service
	jobStore      *JobStore
	propertyStore *property.Store
	cg            *kafkapkg.ConsumerGroup
}

func NewOrderConsumers(brokers []string, chatSvc *chat.Service, service *Service, jobStore *JobStore, propertyStore *property.Store) (*OrderConsumers, error) {
	oc := &OrderConsumers{chatSvc: chatSvc, service: service, jobStore: jobStore, propertyStore: propertyStore}

	handlers := map[string]kafkapkg.MessageHandler{
		kafkapkg.TopicSolanaDepositLocked:   oc.handleDepositLocked,
		kafkapkg.TopicSolanaPartySigned:     oc.handlePartySigned,
		kafkapkg.TopicSolanaEscrowExpired:   oc.handleEscrowExpired,
		kafkapkg.TopicSolanaRentPaid:        oc.handleRentPaid,
		kafkapkg.TopicSolanaDisputeOpened:   oc.handleDisputeOpened,
		kafkapkg.TopicSolanaDepositReleased: oc.handleDepositReleased,
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

	sig := solana.Signature{}
	if evt.TxSignature == sig.String() {
		log.Printf("[order-consumer] invalid transaction signature in party_signed event: %s", evt.TxSignature)
		return nil
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

	if oc.jobStore != nil {
		if err := oc.jobStore.InsertEscrowJob(o.ID, JobTypeExpireEscrow, o.SignDeadline); err != nil {
			log.Printf("[order-consumer] failed to insert expire_escrow job for order %s: %v", o.ID, err)
		}
	}

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
	sig := solana.Signature{}
	if evt.TxSignature == sig.String() {
		log.Printf("[order-consumer] invalid transaction signature in party_signed event: %s", evt.TxSignature)
		return nil
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
		if err := oc.service.store.UpdateTenantSignedOnChain(o.ID, true); err != nil {
			return err
		}
		o.TenantSignedOnchain = true
	case "landlord":
		if err := oc.service.store.UpdateLandlordSignedOnChain(o.ID, true); err != nil {
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

		if oc.jobStore != nil {
			if err := oc.jobStore.InsertEscrowJob(o.ID, JobTypeReleaseDeposit, o.RentEndDate); err != nil {
				log.Printf("[order-consumer] failed to insert release_deposit job for order %s: %v", o.ID, err)
			}

			var periodicity int64 = periodSeconds["month"]
			if oc.propertyStore != nil {
				if prop, err := oc.propertyStore.GetByID(o.PropertyID); err == nil {
					if s, ok := periodSeconds[prop.PeriodType]; ok {
						periodicity = s
					}
				} else {
					log.Printf("[order-consumer] failed to fetch property %s for order %s: %v", o.PropertyID, o.ID, err)
				}
			}

			firstTrigger := o.RentStartDate.Add(time.Duration(periodicity) * time.Second)
			if err := oc.jobStore.InsertPaydueJob(o.ID, firstTrigger, periodicity); err != nil {
				log.Printf("[order-consumer] failed to insert paydue job for order %s: %v", o.ID, err)
			}
		}
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

	sig := solana.Signature{}
	if evt.TxSignature == sig.String() {
		log.Printf("[order-consumer] invalid transaction signature in rent_paid event: %s", evt.TxSignature)
		return nil
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

	oc.chatSvc.SendSystemMessageWithTx(o.ConversationID, fmt.Sprintf("Rent paid in amount of %f %s", float64(evt.Amount)/1000000000, "SOL"), "rent_paid", evt.TxSignature)
	oc.service.publishCentrifugoOrderUpdate(o, "rent_paid", evt.TxSignature)
	log.Printf("[order-consumer] rent paid for order %s amount=%d (tx: %s)", o.ID, evt.Amount, evt.TxSignature)
	return nil
}

func (oc *OrderConsumers) handleDisputeOpened(_ string, value []byte) error {
	var evt kafkapkg.SolanaDisputeOpenedEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	sig := solana.Signature{}
	if evt.TxSignature == sig.String() {
		log.Printf("[order-consumer] invalid transaction signature in dispute_opened event: %s", evt.TxSignature)
		return nil
	}

	o, err := oc.service.store.FindByEscrowAddress(evt.Escrow)
	if err != nil {
		log.Printf("[order-consumer] no order for escrow %s: %v", evt.Escrow, err)
		return nil
	}

	if o.EscrowStatus != StatusActive {
		log.Printf("[order-consumer] order %s not active (is %s), skipping dispute", o.ID, o.EscrowStatus)
		return nil
	}

	if err := oc.service.store.UpdateDisputeReason(o.ID, evt.Reason); err != nil {
		return err
	}
	o.DisputeReason = evt.Reason

	if err := oc.service.store.UpdateStatus(o.ID, StatusDisputed, "system", "dispute opened on-chain"); err != nil {
		return err
	}
	o.EscrowStatus = StatusDisputed

	oc.chatSvc.SendSystemMessageWithTx(o.ConversationID, fmt.Sprintf("Dispute opened: %s", evt.Reason), "dispute_opened", evt.TxSignature)
	oc.service.publishCentrifugoOrderUpdate(o, "dispute_opened", evt.TxSignature)

	log.Printf("[order-consumer] dispute opened for order %s (tx: %s)", o.ID, evt.TxSignature)
	return nil
}

func (oc *OrderConsumers) handleDepositReleased(_ string, value []byte) error {
	var evt kafkapkg.SolanaDepositReleasedEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	sig := solana.Signature{}
	if evt.TxSignature == sig.String() {
		log.Printf("[order-consumer] invalid transaction signature in deposit_released event: %s", evt.TxSignature)
		return nil
	}

	o, err := oc.service.store.FindByEscrowAddress(evt.Escrow)
	if err != nil {
		log.Printf("[order-consumer] no order for escrow %s: %v", evt.Escrow, err)
		return nil
	}

	if o.EscrowStatus != StatusDisputed {
		log.Printf("[order-consumer] order %s not in disputed status (is %s), skipping deposit_released", o.ID, o.EscrowStatus)
		return nil
	}

	// Determine winner by matching recipient to tenant or landlord PK
	var newStatus, winner string
	switch evt.Recipient {
	case o.TenantPK:
		newStatus = StatusDisputeResolvedTenant
		winner = "tenant"
	case o.LandlordPK:
		newStatus = StatusDisputeResolvedLord
		winner = "landlord"
	default:
		log.Printf("[order-consumer] deposit_released recipient %s matches neither tenant nor landlord for order %s", evt.Recipient, o.ID)
		return nil
	}

	if err := oc.service.store.UpdateStatus(o.ID, newStatus, "system", fmt.Sprintf("dispute resolved for %s on-chain", winner)); err != nil {
		return err
	}
	o.EscrowStatus = newStatus

	msg := fmt.Sprintf("Dispute resolved in favour of %s. Reason: %s", winner, evt.Reason)
	oc.chatSvc.SendSystemMessageWithTx(o.ConversationID, msg, "dispute_resolved", evt.TxSignature)
	oc.service.publishCentrifugoOrderUpdate(o, "dispute_resolved", evt.TxSignature)
	oc.service.publishOrderEvent(kafkapkg.TopicOrderDisputeResolved, o)

	log.Printf("[order-consumer] dispute resolved for order %s winner=%s (tx: %s)", o.ID, winner, evt.TxSignature)
	return nil
}

func (oc *OrderConsumers) handleEscrowExpired(_ string, value []byte) error {
	var evt kafkapkg.SolanaEscrowExpiredEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	sig := solana.Signature{}
	if evt.TxSignature == sig.String() {
		log.Printf("[order-consumer] invalid transaction signature in escrow_expired event: %s", evt.TxSignature)
		return nil
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
