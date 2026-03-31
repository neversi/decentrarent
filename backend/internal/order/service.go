package order

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

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
	producer   *kafka.Producer
	centrifugo CentrifugoPublisher
}

func NewService(store *Store, producer *kafka.Producer, centrifugo CentrifugoPublisher) *Service {
	return &Service{store: store, producer: producer, centrifugo: centrifugo}
}

// ─── CreateOrder ────────────────────────────────────────────────────

func (s *Service) CreateOrder(callerID string, req *CreateOrderRequest) (*Order, error) {
	if req.PropertyID == "" || req.LandlordID == "" || req.DepositAmount <= 0 || req.RentAmount <= 0 || req.ConversationID == "" {
		return nil, ErrMissingFields
	}

	rentStart, err := time.Parse(time.RFC3339, req.RentStartDate)
	if err != nil {
		return nil, errors.New("invalid rent_start_date format, use RFC3339")
	}
	rentEnd, err := time.Parse(time.RFC3339, req.RentEndDate)
	if err != nil {
		return nil, errors.New("invalid rent_end_date format, use RFC3339")
	}

	deadlineDays := req.SignDeadlineDays
	if deadlineDays <= 0 {
		deadlineDays = 3
	}

	tokenMint := req.TokenMint
	if tokenMint == "" {
		tokenMint = "SOL"
	}

	o := &Order{
		ConversationID: req.ConversationID,
		PropertyID:     req.PropertyID,
		TenantID:       callerID,
		LandlordID:     req.LandlordID,
		CreatedBy:      callerID,
		DepositAmount:  req.DepositAmount,
		RentAmount:     req.RentAmount,
		TokenMint:      tokenMint,
		EscrowAddress:  req.EscrowAddress,
		SignDeadline:   time.Now().Add(time.Duration(deadlineDays) * 24 * time.Hour),
		RentStartDate:  rentStart,
		RentEndDate:    rentEnd,
		EscrowStatus:   StatusNew,
	}

	created, err := s.store.Create(o)
	if err != nil {
		return nil, err
	}

	s.publishOrderEvent(kafka.TopicOrderCreated, created)
	s.publishCentrifugoOrderUpdate(created, "order_created")
	return created, nil
}

// ─── Sign ───────────────────────────────────────────────────────────

func (s *Service) Sign(orderID, userID string) (*Order, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusAwaitingSignatures {
		return nil, ErrInvalidTransition
	}

	if time.Now().After(o.SignDeadline) {
		s.store.UpdateStatus(o.ID, StatusExpired, userID, "sign deadline passed")
		s.publishOrderEvent(kafka.TopicOrderExpired, o)
		return nil, ErrDeadlinePassed
	}

	role := ""
	switch userID {
	case o.TenantID:
		if o.TenantSigned {
			return nil, ErrAlreadySigned
		}
		if err := s.store.UpdateTenantSigned(o.ID, true); err != nil {
			return nil, err
		}
		o.TenantSigned = true
		role = "tenant"
	case o.LandlordID:
		if o.LandlordSigned {
			return nil, ErrAlreadySigned
		}
		if err := s.store.UpdateLandlordSigned(o.ID, true); err != nil {
			return nil, err
		}
		o.LandlordSigned = true
		role = "landlord"
	default:
		return nil, ErrForbidden
	}

	bothSigned := o.TenantSigned && o.LandlordSigned

	evt := kafka.OrderSignedEvent{
		EventID:        uuid.New().String(),
		OrderID:        o.ID,
		PropertyID:     o.PropertyID,
		TenantWallet:   o.TenantID,
		LandlordWallet: o.LandlordID,
		SignedBy:       userID,
		Role:           role,
		BothSigned:     bothSigned,
		Timestamp:      time.Now(),
	}
	s.producer.Publish(context.Background(), kafka.TopicOrderSigned, o.ID, evt)

	if bothSigned {
		if err := s.store.UpdateStatus(o.ID, StatusActive, userID, "both parties signed"); err != nil {
			return nil, err
		}
		o.EscrowStatus = StatusActive
		s.publishOrderEvent(kafka.TopicOrderActivated, o)
	}

	return o, nil
}

// ─── Settle ─────────────────────────────────────────────────────────

func (s *Service) Settle(orderID, userID string) (*Order, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusActive {
		return nil, ErrInvalidTransition
	}

	if userID != o.LandlordID {
		return nil, ErrForbidden
	}

	if err := s.store.UpdateStatus(o.ID, StatusSettled, userID, "landlord settled escrow"); err != nil {
		return nil, err
	}
	o.EscrowStatus = StatusSettled

	s.publishOrderEvent(kafka.TopicOrderSettled, o)
	return o, nil
}

// ─── OpenDispute ────────────────────────────────────────────────────

func (s *Service) OpenDispute(orderID, userID, reason string) (*Order, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusActive {
		return nil, ErrInvalidTransition
	}

	if userID != o.TenantID && userID != o.LandlordID {
		return nil, ErrForbidden
	}

	if err := s.store.UpdateDisputeReason(o.ID, reason); err != nil {
		return nil, err
	}

	if err := s.store.UpdateStatus(o.ID, StatusDisputed, userID, reason); err != nil {
		return nil, err
	}

	o.EscrowStatus = StatusDisputed
	o.DisputeReason = reason

	evt := kafka.OrderDisputeEvent{
		EventID:        uuid.New().String(),
		OrderID:        o.ID,
		PropertyID:     o.PropertyID,
		TenantWallet:   o.TenantID,
		LandlordWallet: o.LandlordID,
		OpenedBy:       userID,
		Reason:         reason,
		Timestamp:      time.Now(),
	}
	s.producer.Publish(context.Background(), kafka.TopicOrderDisputeOpened, o.ID, evt)

	return o, nil
}

// ─── ResolveDispute ─────────────────────────────────────────────────

func (s *Service) ResolveDispute(orderID, resolverID, winner, reason string) (*Order, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusDisputed {
		return nil, ErrInvalidTransition
	}

	var newStatus string
	switch winner {
	case "tenant":
		newStatus = StatusDisputeResolvedTenant
	case "landlord":
		newStatus = StatusDisputeResolvedLord
	default:
		return nil, ErrInvalidWinner
	}

	if err := s.store.UpdateStatus(o.ID, newStatus, resolverID, reason); err != nil {
		return nil, err
	}

	o.EscrowStatus = newStatus

	evt := kafka.DisputeResolvedEvent{
		EventID:        uuid.New().String(),
		OrderID:        o.ID,
		PropertyID:     o.PropertyID,
		TenantWallet:   o.TenantID,
		LandlordWallet: o.LandlordID,
		Winner:         winner,
		Reason:         reason,
		Timestamp:      time.Now(),
	}
	s.producer.Publish(context.Background(), kafka.TopicOrderDisputeResolved, o.ID, evt)

	return o, nil
}

// ─── ExpireOrder ────────────────────────────────────────────────────

func (s *Service) ExpireOrder(orderID, callerID string) (*Order, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusAwaitingSignatures {
		return nil, ErrInvalidTransition
	}

	if time.Now().Before(o.SignDeadline) {
		return nil, errors.New("deadline has not passed yet")
	}

	if err := s.store.UpdateStatus(o.ID, StatusExpired, callerID, "sign deadline expired"); err != nil {
		return nil, err
	}

	o.EscrowStatus = StatusExpired
	s.publishOrderEvent(kafka.TopicOrderExpired, o)

	return o, nil
}

// ─── PayRent ────────────────────────────────────────────────────────

func (s *Service) PayRent(orderID, userID string, req *PayRentRequest) (*RentPayment, error) {
	o, err := s.store.GetByID(orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if o.EscrowStatus != StatusActive {
		return nil, ErrNotActive
	}

	if userID != o.TenantID {
		return nil, ErrForbidden
	}

	periodStart, err := time.Parse(time.RFC3339, req.PeriodStart)
	if err != nil {
		return nil, errors.New("invalid period_start format")
	}
	periodEnd, err := time.Parse(time.RFC3339, req.PeriodEnd)
	if err != nil {
		return nil, errors.New("invalid period_end format")
	}

	payment := &RentPayment{
		OrderID:     orderID,
		PaidBy:      userID,
		Amount:      o.RentAmount,
		TxHash:      req.TxHash,
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
	}

	saved, err := s.store.AddRentPayment(payment)
	if err != nil {
		return nil, err
	}

	evt := kafka.RentPaidEvent{
		EventID:     uuid.New().String(),
		OrderID:     orderID,
		PaidBy:      userID,
		Amount:      o.RentAmount,
		TxHash:      req.TxHash,
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		Timestamp:   time.Now(),
	}
	s.producer.Publish(context.Background(), kafka.TopicRentPaid, orderID, evt)

	return saved, nil
}

// ─── ValidateTransition ─────────────────────────────────────────────

func ValidateTransition(from, to string) bool {
	allowed, ok := AllowedTransitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
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

	if err := s.store.UpdateStatus(o.ID, StatusAwaitingDeposit, userID, "order accepted"); err != nil {
		return nil, err
	}
	o.EscrowStatus = StatusAwaitingDeposit

	s.publishCentrifugoOrderUpdate(o, "order_accepted")
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

	s.publishCentrifugoOrderUpdate(o, "order_rejected")
	return o, nil
}

// ─── helpers ────────────────────────────────────────────────────────

func (s *Service) publishCentrifugoOrderUpdate(o *Order, eventType string) {
	if s.centrifugo == nil {
		return
	}

	channel := fmt.Sprintf("orders:%s", o.ConversationID)
	payload := map[string]interface{}{
		"type":     eventType,
		"order_id": o.ID,
		"status":   o.EscrowStatus,
		"order":    o,
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
		DepositAmount:  o.DepositAmount,
		RentAmount:     o.RentAmount,
		EscrowStatus:   o.EscrowStatus,
		Timestamp:      time.Now(),
	}
	s.producer.Publish(context.Background(), topic, o.ID, evt)
}
