package order

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/google/uuid"

	"github.com/abdro/decentrarent/backend/internal/chat"
	"github.com/abdro/decentrarent/backend/internal/escrow"
	"github.com/abdro/decentrarent/backend/internal/kafka"
)

var (
	ErrOrderNotFound     = errors.New("order not found")
	ErrForbidden         = errors.New("forbidden")
	ErrInvalidTransition = errors.New("invalid status transition")
	ErrAlreadySigned     = errors.New("already signed")
	ErrNotActive         = errors.New("order is not active")
	ErrDeadlinePassed    = errors.New("sign deadline has passed")
	ErrInvalidWinner     = errors.New("winner must be 'tenant' or 'landlord'")
	ErrMissingFields     = errors.New("missing required fields")
	ErrNotNewOrder       = errors.New("order is not in 'new' status")
)

type CentrifugoPublisher interface {
	PublishJSON(channel string, data interface{}) error
}

type Service struct {
	store      *Store
	chatStore  *chat.Store
	producer   *kafka.Producer
	centrifugo CentrifugoPublisher
	escrowSvc  *escrow.Service
}

func NewService(store *Store, chatStore *chat.Store, producer *kafka.Producer, centrifugo CentrifugoPublisher, escrowSvc *escrow.Service) *Service {
	return &Service{store: store, chatStore: chatStore, producer: producer, centrifugo: centrifugo, escrowSvc: escrowSvc}
}

// ─── CreateOrder ────────────────────────────────────────────────────

func (s *Service) CreateOrder(callerID string, req *CreateOrderRequest) (*Order, error) {
	if req.PropertyID == "" || req.LandlordID == "" || req.DepositAmount <= 0 || req.RentAmount <= 0 || req.ConversationID == "" {
		return nil, ErrMissingFields
	}

	conv, err := s.chatStore.GetConversation(req.ConversationID)
	if err != nil {
		return nil, errors.New("conversation not found")
	}
	if conv.PropertyID != req.PropertyID || (conv.LandlordID != callerID && conv.LoanerID != callerID) {
		return nil, errors.New("conversation does not match order details")
	}

	rentStart, err := time.Parse(time.RFC3339, req.RentStartDate)
	if err != nil {
		return nil, errors.New("invalid rent_start_date format, use RFC3339")
	}
	rentEnd, err := time.Parse(time.RFC3339, req.RentEndDate)
	if err != nil {
		return nil, errors.New("invalid rent_end_date format, use RFC3339")
	}

	deadlineMinutes := req.SignDeadlineMinutes
	if deadlineMinutes <= 0 {
		deadlineMinutes = 3 * 24 * 60 // default 3 days
	}

	tokenMint := req.TokenMint
	if tokenMint == "" {
		tokenMint = "SOL"
	}

	o := &Order{
		ConversationID: req.ConversationID,
		PropertyID:     req.PropertyID,
		TenantID:       conv.LoanerID,
		LandlordID:     conv.LandlordID,
		CreatedBy:      callerID,
		DepositAmount:  req.DepositAmount,
		RentAmount:     req.RentAmount,
		TokenMint:      tokenMint,
		EscrowAddress:  req.EscrowAddress,
		SignDeadline:   time.Now().Add(time.Duration(deadlineMinutes) * time.Minute),
		RentStartDate:  rentStart,
		RentEndDate:    rentEnd,
		EscrowStatus:   StatusNew,
	}

	created, err := s.store.Create(o)
	if err != nil {
		return nil, err
	}

	s.publishOrderEvent(kafka.TopicOrderCreated, created)
	s.publishCentrifugoOrderUpdate(created, "order_created", "")
	return created, nil
}

// ─── AcceptOrder ────────────────────────────────────────────────────

func (s *Service) AcceptOrder(orderID, userID string) (*Order, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusNew {
		return nil, ErrNotNewOrder
	}

	if userID != o.TenantID && userID != o.LandlordID {
		return nil, ErrForbidden
	}

	switch userID {
	case o.LandlordID:
		// Landlord accepts the order, waiting for tenant to lock deposit
		if err := s.store.UpdateLandlordSigned(o.ID, true); err != nil {
			return nil, err
		}
		o.LandlordSigned = true

		s.publishCentrifugoOrderUpdate(o, "order_accepted", "")
	case o.TenantID:
		// Tenant accepts the order, waiting for landlord to accept
		if err := s.store.UpdateTenantSigned(o.ID, true); err != nil {
			return nil, err
		}
		o.TenantSigned = true

		s.publishCentrifugoOrderUpdate(o, "order_accepted", "")
	}

	if o.TenantSigned && o.LandlordSigned {
		if err := s.store.UpdateStatus(o.ID, StatusAwaitingDeposit, userID, "order signed by both sides"); err != nil {
			return nil, err
		}
		o.EscrowStatus = StatusAwaitingDeposit
		s.publishCentrifugoOrderUpdate(o, "order_both_accepted", "")

	}

	return o, nil
}

// ─── RejectOrder ────────────────────────────────────────────────────

func (s *Service) RejectOrder(orderID, userID string) (*Order, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusNew {
		return nil, ErrNotNewOrder
	}

	if userID != o.TenantID && userID != o.LandlordID {
		return nil, ErrForbidden
	}

	if err := s.store.UpdateStatus(o.ID, StatusRejected, userID, "order rejected"); err != nil {
		return nil, err
	}
	o.EscrowStatus = StatusRejected

	s.publishCentrifugoOrderUpdate(o, "order_rejected", "")
	return o, nil
}

// ─── OpenDispute ────────────────────────────────────────────────────

var ErrDisputeReasonEmpty = errors.New("dispute reason cannot be empty")
var ErrNotActiveOrder = errors.New("order must be active to open a dispute")

func (s *Service) OpenDispute(orderID, userID, reason string) (*Order, error) {
	if reason == "" {
		return nil, ErrDisputeReasonEmpty
	}

	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.TenantID != userID && o.LandlordID != userID {
		return nil, ErrForbidden
	}

	if o.EscrowStatus != StatusActive {
		return nil, ErrNotActiveOrder
	}

	landlordPK, err := solana.PublicKeyFromBase58(o.LandlordPK)
	if err != nil {
		return nil, fmt.Errorf("invalid landlord public key: %w", err)
	}
	tenantPK, err := solana.PublicKeyFromBase58(o.TenantPK)
	if err != nil {
		return nil, fmt.Errorf("invalid tenant public key: %w", err)
	}
	orderUUID, err := uuid.Parse(o.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid order id: %w", err)
	}

	tx, err := s.escrowSvc.OpenDispute(context.Background(), landlordPK, tenantPK, [16]byte(orderUUID), reason)
	if err != nil {
		return nil, fmt.Errorf("on-chain open_dispute failed: %w", err)
	}

	log.Printf("opened dispute: %s", tx)

	// if err := s.store.UpdateDisputeReason(o.ID, reason); err != nil {
	// 	return nil, fmt.Errorf("update status: %w", err)
	// }
	// o.DisputeReason = reason

	// if err := s.store.UpdateStatus(o.ID, StatusDisputed, "system", "dispute opened on-chain"); err != nil {
	// 	return nil, fmt.Errorf("update status: %w", err)
	// }
	// o.EscrowStatus = StatusDisputed

	// s.chatSvc.SendSystemMessageWithTx(o.ConversationID, fmt.Sprintf("Dispute opened: %s", reason), "dispute_opened", tx)
	// s.service.publishCentrifugoOrderUpdate(o, "dispute_opened", tx)

	return o, nil
}

// ─── ResolveDispute ─────────────────────────────────────────────────

var ErrNotDisputedOrder = errors.New("order must be in disputed status to resolve")

func (s *Service) ResolveDispute(orderID, winner, reason string) (*Order, error) {
	if winner != "tenant" && winner != "landlord" {
		return nil, ErrInvalidWinner
	}
	if reason == "" {
		return nil, ErrDisputeReasonEmpty
	}

	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}
	if o.EscrowStatus != StatusDisputed {
		return nil, ErrNotDisputedOrder
	}

	landlordPK, err := solana.PublicKeyFromBase58(o.LandlordPK)
	if err != nil {
		return nil, fmt.Errorf("invalid landlord public key: %w", err)
	}
	tenantPK, err := solana.PublicKeyFromBase58(o.TenantPK)
	if err != nil {
		return nil, fmt.Errorf("invalid tenant public key: %w", err)
	}
	orderUUID, err := uuid.Parse(o.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid order id: %w", err)
	}

	var tx string
	if winner == "tenant" {
		tx, err = s.escrowSvc.ResolveDisputeTenant(context.Background(), landlordPK, tenantPK, [16]byte(orderUUID), reason)
	} else {
		tx, err = s.escrowSvc.ResolveDisputeLandlord(context.Background(), landlordPK, tenantPK, [16]byte(orderUUID), reason)
	}
	if err != nil {
		return nil, fmt.Errorf("on-chain resolve_dispute failed: %w", err)
	}

	log.Printf("[order] resolve dispute submitted winner=%s tx=%s", winner, tx)
	return o, nil
}

// ─── helpers ────────────────────────────────────────────────────────

func (s *Service) publishCentrifugoOrderUpdate(o *Order, eventType string, tx string) {
	if s.centrifugo == nil {
		return
	}

	channel := fmt.Sprintf("orders:%s", o.ConversationID)
	payload := map[string]interface{}{
		"type":     eventType,
		"order_id": o.ID,
		"status":   o.EscrowStatus,
		"order":    o,
		"tx":       tx,
	}

	if err := s.centrifugo.PublishJSON(channel, payload); err != nil {
		log.Printf("[order] failed to publish centrifugo event %s: %v", eventType, err)
	}
}

func (s *Service) publishOrderEvent(topic string, o *Order) {
	evt := kafka.OrderEvent{
		EventID:        uuid.New().String(),
		OrderID:        o.ID,
		PropertyID:     o.PropertyID,
		TenantWallet:   o.TenantID,
		LandlordWallet: o.LandlordID,
		TokenMint:      o.TokenMint,
		DepositAmount:  o.DepositAmount,
		RentAmount:     o.RentAmount,
		EscrowStatus:   o.EscrowStatus,
		Timestamp:      time.Now(),
	}
	s.producer.Publish(context.Background(), topic, o.ID, evt)
}
