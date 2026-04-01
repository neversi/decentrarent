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
