# Order Chat Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add order creation, negotiation, and on-chain lifecycle management to the chat interface with real-time notifications via Centrifugo.

**Architecture:** Backend extends the order model with `conversation_id`, `created_by`, and new statuses (`rejected`, `awaiting_deposit`). New Kafka consumers handle Solana on-chain events and mutate order state. Frontend adds a toast notification system, order creation modal in chat, inline order cards, a toggleable side panel, and real-time Centrifugo subscriptions for order updates.

**Tech Stack:** Go (chi router, sarama Kafka), React 19, TypeScript, Zustand, Centrifuge client, Solana wallet-adapter, existing inline-style patterns.

---

## File Structure

### Backend
| File | Responsibility |
|---|---|
| `backend/internal/order/model.go` | Modify — add `ConversationID`, `CreatedBy` fields, new statuses, updated transitions |
| `backend/internal/order/store.go` | Modify — add DB columns, `FindByEscrowAddress`, `ListByConversationID` queries |
| `backend/internal/order/service.go` | Modify — add `AcceptOrder`, `RejectOrder`, Centrifugo publishing |
| `backend/internal/order/handler.go` | Modify — add `Accept`, `Reject` endpoints, `conversation_id` filter |
| `backend/internal/order/consumers.go` | Create — Kafka consumers for `solana.*` events |
| `backend/internal/kafka/kafka.go` | Modify — add Solana topic constants and event types |
| `backend/cmd/server/main.go` | Modify — wire order consumers, pass centrifugo client to order service |

### Frontend
| File | Responsibility |
|---|---|
| `frontend/src/features/toast/store.ts` | Create — Zustand toast store |
| `frontend/src/features/toast/components/ToastProvider.tsx` | Create — toast renderer component |
| `frontend/src/features/orders/types.ts` | Create — Order types and interfaces |
| `frontend/src/features/orders/api.ts` | Create — Order API functions |
| `frontend/src/features/orders/hooks/useOrderUpdates.ts` | Create — Centrifugo subscription hook for order events |
| `frontend/src/features/orders/components/CreateOrderModal.tsx` | Create — order creation modal form |
| `frontend/src/features/orders/components/OrderCard.tsx` | Create — inline order card for chat |
| `frontend/src/features/orders/components/OrdersPanel.tsx` | Create — toggleable side panel |
| `frontend/src/features/chat/components/ChatWindow.tsx` | Modify — integrate order button, panel toggle, render order cards |
| `frontend/src/App.tsx` | Modify — add `<ToastProvider />` |

---

## Task 1: Backend — Update Order Model and Statuses

**Files:**
- Modify: `backend/internal/order/model.go`

- [ ] **Step 1: Add new status constants and update transitions**

In `backend/internal/order/model.go`, add the new statuses after the existing constants and update the maps:

```go
const (
	StatusNew                   = "new"
	StatusRejected              = "rejected"
	StatusAwaitingDeposit       = "awaiting_deposit"
	StatusAwaitingSignatures    = "awaiting_signatures"
	StatusActive                = "active"
	StatusDisputed              = "disputed"
	StatusExpired               = "expired"
	StatusSettled               = "settled"
	StatusDisputeResolvedTenant = "dispute_resolved_tenant"
	StatusDisputeResolvedLord   = "dispute_resolved_landlord"
)

var AllStatuses = map[string]bool{
	StatusNew:                   true,
	StatusRejected:              true,
	StatusAwaitingDeposit:       true,
	StatusAwaitingSignatures:    true,
	StatusActive:                true,
	StatusDisputed:              true,
	StatusExpired:               true,
	StatusSettled:               true,
	StatusDisputeResolvedTenant: true,
	StatusDisputeResolvedLord:   true,
}

var AllowedTransitions = map[string][]string{
	StatusNew:                   {StatusRejected, StatusAwaitingDeposit},
	StatusAwaitingDeposit:       {StatusAwaitingSignatures},
	StatusAwaitingSignatures:    {StatusActive, StatusExpired},
	StatusActive:                {StatusSettled, StatusDisputed},
	StatusDisputed:              {StatusDisputeResolvedTenant, StatusDisputeResolvedLord},
	StatusExpired:               {},
	StatusSettled:               {},
	StatusRejected:              {},
	StatusDisputeResolvedTenant: {},
	StatusDisputeResolvedLord:   {},
}
```

- [ ] **Step 2: Add `ConversationID` and `CreatedBy` to Order struct**

Update the `Order` struct in `backend/internal/order/model.go`:

```go
type Order struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	PropertyID     string    `json:"property_id"`
	TenantID       string    `json:"tenant_id"`
	LandlordID     string    `json:"landlord_id"`
	CreatedBy      string    `json:"created_by"`
	DepositAmount  int64     `json:"deposit_amount"`
	RentAmount     int64     `json:"rent_amount"`
	TokenMint      string    `json:"token_mint"`
	EscrowStatus   string    `json:"escrow_status"`
	EscrowAddress  string    `json:"escrow_address"`
	TenantSigned   bool      `json:"tenant_signed"`
	LandlordSigned bool      `json:"landlord_signed"`
	SignDeadline   time.Time `json:"sign_deadline"`
	RentStartDate  time.Time `json:"rent_start_date"`
	RentEndDate    time.Time `json:"rent_end_date"`
	DisputeReason  string    `json:"dispute_reason"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
```

- [ ] **Step 3: Update `CreateOrderRequest` and add `ConversationID` to `ListFilter`**

```go
type CreateOrderRequest struct {
	ConversationID   string `json:"conversation_id"`
	PropertyID       string `json:"property_id"`
	LandlordID       string `json:"landlord_id"`
	DepositAmount    int64  `json:"deposit_amount"`
	RentAmount       int64  `json:"rent_amount"`
	TokenMint        string `json:"token_mint"`
	EscrowAddress    string `json:"escrow_address"`
	RentStartDate    string `json:"rent_start_date"`
	RentEndDate      string `json:"rent_end_date"`
	SignDeadlineDays int    `json:"sign_deadline_days"`
}

type ListFilter struct {
	TenantID       string
	LandlordID     string
	PropertyID     string
	ConversationID string
	EscrowStatus   string
	Limit          int
	Offset         int
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./internal/order/`

Expected: compilation errors from store/service referencing old column counts — that's expected and will be fixed in the next task.

- [ ] **Step 5: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add backend/internal/order/model.go
git commit -m "feat(order): add conversation_id, created_by fields and new statuses"
```

---

## Task 2: Backend — Update Store (DB Schema + Queries)

**Files:**
- Modify: `backend/internal/order/store.go`

- [ ] **Step 1: Update the Migrate method to add new columns**

Add these ALTER statements to the `renames` slice in the `Migrate()` method (they safely fail if column already exists):

```go
renames := []string{
	`ALTER TABLE orders RENAME COLUMN tenant_wallet TO tenant_id`,
	`ALTER TABLE orders RENAME COLUMN landlord_wallet TO landlord_id`,
	`ALTER TABLE orders ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT ''`,
}
```

Also add an index after the existing index creation lines:

```go
`CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id)`,
`CREATE INDEX IF NOT EXISTS idx_orders_escrow_address ON orders(escrow_address)`,
```

- [ ] **Step 2: Update the `Create` method to include new fields**

Replace the `Create` method's INSERT query and scan fields:

```go
func (s *Store) Create(o *Order) (*Order, error) {
	o.ID = uuid.New().String()
	o.EscrowStatus = StatusNew
	o.TenantSigned = false
	o.LandlordSigned = false
	o.CreatedAt = time.Now()
	o.UpdatedAt = time.Now()

	_, err := s.db.Exec(
		`INSERT INTO orders
			(id, conversation_id, property_id, tenant_id, landlord_id, created_by,
			 deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
			 tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
			 dispute_reason, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		o.ID, o.ConversationID, o.PropertyID, o.TenantID, o.LandlordID, o.CreatedBy,
		o.DepositAmount, o.RentAmount, o.TokenMint, o.EscrowStatus, o.EscrowAddress,
		o.TenantSigned, o.LandlordSigned, o.SignDeadline, o.RentStartDate, o.RentEndDate,
		o.DisputeReason, o.CreatedAt, o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	s.addHistory(o.ID, "", StatusNew, o.CreatedBy, "order created")

	return o, nil
}
```

Note: The initial status is now `StatusNew` (not `StatusAwaitingSignatures`).

- [ ] **Step 3: Update all SELECT scan columns in `GetByID`, `List`, `ListByParticipant`**

The column list for all SELECT queries needs to include `conversation_id` and `created_by`. Update the `GetByID` method:

```go
func (s *Store) GetByID(id string) (*Order, error) {
	o := &Order{}
	err := s.db.QueryRow(
		`SELECT id, conversation_id, property_id, tenant_id, landlord_id, created_by,
		        deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
		        tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
		        dispute_reason, created_at, updated_at
		 FROM orders WHERE id = $1`, id,
	).Scan(
		&o.ID, &o.ConversationID, &o.PropertyID, &o.TenantID, &o.LandlordID, &o.CreatedBy,
		&o.DepositAmount, &o.RentAmount, &o.TokenMint, &o.EscrowStatus, &o.EscrowAddress,
		&o.TenantSigned, &o.LandlordSigned, &o.SignDeadline, &o.RentStartDate, &o.RentEndDate,
		&o.DisputeReason, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return o, nil
}
```

Apply the same column pattern to `List` and `ListByParticipant` — the SELECT and Scan fields must match. Also update the `List` method to support `ConversationID` filter:

```go
if f.ConversationID != "" {
	query += fmt.Sprintf(" AND conversation_id = $%d", argIdx)
	args = append(args, f.ConversationID)
	argIdx++
}
```

Add this block after the existing `f.EscrowStatus` check in the `List` method.

- [ ] **Step 4: Add `FindByEscrowAddress` method**

Add this new method at the end of `store.go`, before the `helpers` section:

```go
func (s *Store) FindByEscrowAddress(escrowAddress string) (*Order, error) {
	o := &Order{}
	err := s.db.QueryRow(
		`SELECT id, conversation_id, property_id, tenant_id, landlord_id, created_by,
		        deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
		        tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
		        dispute_reason, created_at, updated_at
		 FROM orders WHERE escrow_address = $1`, escrowAddress,
	).Scan(
		&o.ID, &o.ConversationID, &o.PropertyID, &o.TenantID, &o.LandlordID, &o.CreatedBy,
		&o.DepositAmount, &o.RentAmount, &o.TokenMint, &o.EscrowStatus, &o.EscrowAddress,
		&o.TenantSigned, &o.LandlordSigned, &o.SignDeadline, &o.RentStartDate, &o.RentEndDate,
		&o.DisputeReason, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return o, nil
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./internal/order/`

Expected: compilation errors from service.go (CreateOrder signature still references old fields) — will be fixed in Task 3.

- [ ] **Step 6: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add backend/internal/order/store.go
git commit -m "feat(order): update store with conversation_id, created_by columns and FindByEscrowAddress"
```

---

## Task 3: Backend — Update Service (Accept, Reject, Centrifugo)

**Files:**
- Modify: `backend/internal/order/service.go`

- [ ] **Step 1: Update Service struct to include CentrifugoClient**

The service needs a way to publish Centrifugo notifications. Add a generic publish interface so it doesn't depend on the chat package directly:

```go
type CentrifugoPublisher interface {
	PublishToChannel(channel string, data interface{}) error
}

type Service struct {
	store      *Store
	producer   *kafka.Producer
	centrifugo CentrifugoPublisher
}

func NewService(store *Store, producer *kafka.Producer, centrifugo CentrifugoPublisher) *Service {
	return &Service{store: store, producer: producer, centrifugo: centrifugo}
}
```

Note: The existing `chat.CentrifugoClient.PublishToChannel` method signature is `(channel string, msg *Message) error` — it takes a chat `*Message`, not a generic `interface{}`. We need a new method or a wrapper. The simplest approach: add a `PublishJSON` method to the centrifugo client. But since we don't want to modify the chat package for this, we'll create a thin adapter in the order package. Instead, let's define the interface to accept `interface{}` and create a simple adapter:

```go
type CentrifugoPublisher interface {
	PublishJSON(channel string, data interface{}) error
}
```

We'll implement this interface in `main.go` using the existing centrifugo client's HTTP API pattern. For now, add a `nil` check so things work without centrifugo:

- [ ] **Step 2: Add new error and update `CreateOrder`**

Add the error variable:

```go
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
```

Update `CreateOrder` to accept `callerID` (either tenant or landlord can create), set `CreatedBy` and `ConversationID`:

```go
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

	// Determine tenant/landlord based on caller
	tenantID := callerID
	landlordID := req.LandlordID
	if callerID == req.LandlordID {
		// Landlord is creating the order — need tenant ID from somewhere
		// In this case, the caller is the landlord, so TenantID comes from the conversation context
		// The frontend will send the correct LandlordID; if callerID == LandlordID, we need TenantID
		// For now, the frontend must always provide the LandlordID field as the actual landlord wallet
		tenantID = callerID
		landlordID = req.LandlordID
	}

	o := &Order{
		ConversationID: req.ConversationID,
		PropertyID:     req.PropertyID,
		TenantID:       tenantID,
		LandlordID:     landlordID,
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
```

- [ ] **Step 3: Add `AcceptOrder` and `RejectOrder` methods**

```go
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

	s.publishOrderEvent(kafka.TopicOrderCreated, o) // reuse topic to notify chat consumers
	s.publishCentrifugoOrderUpdate(o, "order_accepted")
	return o, nil
}

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
```

- [ ] **Step 4: Add Centrifugo helper method**

```go
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
```

Add `"fmt"` and `"log"` to the imports if not already present.

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./internal/order/`

Expected: compilation error in `main.go` because `NewService` signature changed — will fix in Task 5.

- [ ] **Step 6: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add backend/internal/order/service.go
git commit -m "feat(order): add AcceptOrder, RejectOrder and Centrifugo publishing"
```

---

## Task 4: Backend — Update Handler (Accept, Reject Endpoints)

**Files:**
- Modify: `backend/internal/order/handler.go`

- [ ] **Step 1: Add Accept handler**

```go
func (h *Handler) Accept(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.service.AcceptOrder(id, userID)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrForbidden {
			status = http.StatusForbidden
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(o)
}
```

- [ ] **Step 2: Add Reject handler**

```go
func (h *Handler) Reject(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.service.RejectOrder(id, userID)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrForbidden {
			status = http.StatusForbidden
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(o)
}
```

- [ ] **Step 3: Update List handler to support `conversation_id` filter**

In the `List` method, add `conversation_id` to the filter construction. Update the filter building section:

```go
filter := &ListFilter{
	PropertyID:     q.Get("property_id"),
	ConversationID: q.Get("conversation_id"),
	EscrowStatus:   q.Get("status"),
	Limit:          limit,
	Offset:         offset,
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add backend/internal/order/handler.go
git commit -m "feat(order): add Accept and Reject HTTP handlers"
```

---

## Task 5: Backend — Kafka Topics, Consumers, and Wiring

**Files:**
- Modify: `backend/internal/kafka/kafka.go`
- Create: `backend/internal/order/consumers.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add Solana event topics and types to kafka.go**

Add new topic constants in `backend/internal/kafka/kafka.go`:

```go
const (
	// Existing topics
	TopicOrderCreated         = "order.created"
	TopicOrderSigned          = "order.signed"
	TopicOrderActivated       = "order.activated"
	TopicOrderExpired         = "order.expired"
	TopicOrderSettled         = "order.settled"
	TopicOrderDisputeOpened   = "order.dispute.opened"
	TopicOrderDisputeResolved = "order.dispute.resolved"
	TopicRentPaid             = "order.rent.paid"

	// Solana on-chain event topics
	TopicSolanaDepositLocked = "solana.deposit.locked"
	TopicSolanaPartySigned   = "solana.party.signed"
	TopicSolanaEscrowExpired = "solana.escrow.expired"
)
```

Update `AllTopics()` to include the new topics:

```go
func AllTopics() []string {
	return []string{
		TopicOrderCreated,
		TopicOrderSigned,
		TopicOrderActivated,
		TopicOrderExpired,
		TopicOrderSettled,
		TopicOrderDisputeOpened,
		TopicOrderDisputeResolved,
		TopicRentPaid,
		TopicSolanaDepositLocked,
		TopicSolanaPartySigned,
		TopicSolanaEscrowExpired,
	}
}
```

Add new event types matching the Solana Anchor events:

```go
type SolanaDepositLockedEvent struct {
	Escrow        string `json:"escrow"`
	Landlord      string `json:"landlord"`
	Tenant        string `json:"tenant"`
	DepositAmount uint64 `json:"deposit_amount"`
	Deadline      int64  `json:"deadline"`
}

type SolanaPartySignedEvent struct {
	Escrow string `json:"escrow"`
	Signer string `json:"signer"`
	Role   string `json:"role"`
}

type SolanaEscrowExpiredEvent struct {
	Escrow     string `json:"escrow"`
	RefundedTo string `json:"refunded_to"`
	Amount     uint64 `json:"amount"`
}
```

- [ ] **Step 2: Create `backend/internal/order/consumers.go`**

```go
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

func (oc *OrderConsumers) handleDepositLocked(topic string, value []byte) error {
	var evt kafkapkg.SolanaDepositLockedEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	o, err := oc.service.store.FindByEscrowAddress(evt.Escrow)
	if err != nil {
		log.Printf("[order-consumer] no order for escrow %s: %v", evt.Escrow, err)
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

	oc.service.publishCentrifugoOrderUpdate(o, "deposit_locked")

	// Publish internal Kafka event for chat consumers
	oc.service.publishOrderEvent(kafkapkg.TopicOrderCreated, o)

	log.Printf("[order-consumer] deposit locked for order %s, now awaiting_signatures", o.ID)
	return nil
}

func (oc *OrderConsumers) handlePartySigned(topic string, value []byte) error {
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
		o.TenantSigned = true
	case "landlord":
		if err := oc.service.store.UpdateLandlordSigned(o.ID, true); err != nil {
			return err
		}
		o.LandlordSigned = true
	default:
		log.Printf("[order-consumer] unknown role %s for escrow %s", evt.Role, evt.Escrow)
		return nil
	}

	// Publish signing event to Kafka for chat consumers
	signEvt := kafkapkg.OrderSignedEvent{
		EventID:        uuid.New().String(),
		OrderID:        o.ID,
		PropertyID:     o.PropertyID,
		TenantWallet:   o.TenantID,
		LandlordWallet: o.LandlordID,
		SignedBy:       evt.Signer,
		Role:           evt.Role,
		BothSigned:     o.TenantSigned && o.LandlordSigned,
		Timestamp:      time.Now(),
	}
	oc.service.producer.Publish(context.Background(), kafkapkg.TopicOrderSigned, o.ID, signEvt)

	oc.service.publishCentrifugoOrderUpdate(o, "party_signed")

	if o.TenantSigned && o.LandlordSigned {
		if err := oc.service.store.UpdateStatus(o.ID, StatusActive, "system", "both parties signed on-chain"); err != nil {
			return err
		}
		o.EscrowStatus = StatusActive
		oc.service.publishOrderEvent(kafkapkg.TopicOrderActivated, o)
		oc.service.publishCentrifugoOrderUpdate(o, "order_activated")
		log.Printf("[order-consumer] order %s activated — both parties signed", o.ID)
	} else {
		log.Printf("[order-consumer] %s signed order %s", evt.Role, o.ID)
	}

	return nil
}

func (oc *OrderConsumers) handleEscrowExpired(topic string, value []byte) error {
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
	oc.service.publishCentrifugoOrderUpdate(o, "order_expired")

	log.Printf("[order-consumer] order %s expired", o.ID)
	return nil
}
```

- [ ] **Step 3: Create a CentrifugoPublisher adapter and update main.go wiring**

Add to `backend/internal/order/service.go` (or keep the interface there as defined in Task 3).

In `backend/cmd/server/main.go`, create a simple adapter that implements `order.CentrifugoPublisher` using the existing `chat.CentrifugoClient`:

Update the order service creation and add the adapter. Replace the `orderService` creation line and add order consumers:

```go
// Create a centrifugo adapter for the order service
orderCentrifugo := &orderCentrifugoAdapter{client: centrifugoClient}
orderService := order.NewService(orderStore, kafkaProducer, orderCentrifugo)

// ... after chatConsumers ...

// Order Kafka consumers (Solana events)
orderConsumers, err := order.NewOrderConsumers(cfg.KafkaBrokers, orderService)
if err != nil {
	log.Printf("Warning: Order Kafka consumers not available: %v", err)
} else {
	defer orderConsumers.Close()
	orderConsumers.Start(ctx)
}
```

Add the adapter struct at the bottom of main.go (before `main` function close, or as a type outside `main`):

```go
type orderCentrifugoAdapter struct {
	client *chat.CentrifugoClient
}

func (a *orderCentrifugoAdapter) PublishJSON(channel string, data interface{}) error {
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}

	payload := struct {
		Method string      `json:"method"`
		Params interface{} `json:"params"`
	}{
		Method: "publish",
		Params: struct {
			Channel string          `json:"channel"`
			Data    json.RawMessage `json:"data"`
		}{
			Channel: channel,
			Data:    body,
		},
	}

	reqBody, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", cfg.CentrifugoURL+"/api", bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "apikey "+cfg.CentrifugoKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
```

Since this creates a closure over `cfg`, it's simpler to make the adapter a method receiver or pass the URL/key explicitly. Use this cleaner approach — define the adapter struct outside main:

```go
type orderCentrifugoAdapter struct {
	apiURL string
	apiKey string
}

func (a *orderCentrifugoAdapter) PublishJSON(channel string, data interface{}) error {
	innerData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(map[string]interface{}{
		"method": "publish",
		"params": map[string]interface{}{
			"channel": channel,
			"data":    json.RawMessage(innerData),
		},
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", a.apiURL+"/api", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "apikey "+a.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
```

In `main()`:

```go
orderCentrifugo := &orderCentrifugoAdapter{apiURL: cfg.CentrifugoURL, apiKey: cfg.CentrifugoKey}
orderService := order.NewService(orderStore, kafkaProducer, orderCentrifugo)
```

Add `"bytes"` and `"encoding/json"` to main.go imports.

- [ ] **Step 4: Add new route registrations in main.go**

Add inside the protected routes group:

```go
r.Post("/orders/{id}/accept", orderHandler.Accept)
r.Post("/orders/{id}/reject", orderHandler.Reject)
```

- [ ] **Step 5: Verify full backend compiles**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: PASS (no errors)

- [ ] **Step 6: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add backend/internal/kafka/kafka.go backend/internal/order/consumers.go backend/cmd/server/main.go
git commit -m "feat(order): add Solana Kafka consumers, Centrifugo adapter, and Accept/Reject routes"
```

---

## Task 6: Frontend — Toast System

**Files:**
- Create: `frontend/src/features/toast/store.ts`
- Create: `frontend/src/features/toast/components/ToastProvider.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create toast store**

Create `frontend/src/features/toast/store.ts`:

```typescript
import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info' | 'onchain';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    const duration = toast.duration ?? 5000;
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
```

- [ ] **Step 2: Create ToastProvider component**

Create `frontend/src/features/toast/components/ToastProvider.tsx`:

```tsx
import { useToastStore, type ToastVariant } from '../store';

const variantStyles: Record<ToastVariant, { borderColor: string; icon: string; iconColor: string }> = {
  success: { borderColor: '#3DD68C', icon: '✓', iconColor: '#3DD68C' },
  error: { borderColor: '#FF4D6A', icon: '✕', iconColor: '#FF4D6A' },
  info: { borderColor: '#E07840', icon: '●', iconColor: '#E07840' },
  onchain: { borderColor: '#9945FF', icon: '◆', iconColor: '#9945FF' },
};

export function ToastProvider() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {toasts.map((toast) => {
        const variant = variantStyles[toast.variant];
        return (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            style={{
              padding: '14px 16px',
              background: '#141416',
              borderRadius: 10,
              borderLeft: `3px solid ${variant.borderColor}`,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              animation: 'slideIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: variant.iconColor, fontSize: 16 }}>{variant.icon}</span>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{toast.title}</div>
                {toast.message && (
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{toast.message}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 3: Add ToastProvider to App.tsx**

In `frontend/src/App.tsx`, add the import and render `<ToastProvider />` inside the `BrowserRouter`, right before `<AppShell>`:

```tsx
import { ToastProvider } from './features/toast/components/ToastProvider'

// In the App component return:
return (
  <ConnectionProvider endpoint={endpoint}>
    <WalletProvider wallets={[]} autoConnect>
      <WalletModalProvider>
        <BrowserRouter>
          <ToastProvider />
          <AppShell>
            <AppRoutes />
          </AppShell>
        </BrowserRouter>
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd /Users/abdro/Desktop/DecentraRent/frontend && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add frontend/src/features/toast/ frontend/src/App.tsx
git commit -m "feat(frontend): add toast notification system with Zustand store"
```

---

## Task 7: Frontend — Order Types and API

**Files:**
- Create: `frontend/src/features/orders/types.ts`
- Create: `frontend/src/features/orders/api.ts`

- [ ] **Step 1: Create order types**

Create `frontend/src/features/orders/types.ts`:

```typescript
export type OrderStatus =
  | 'new'
  | 'rejected'
  | 'awaiting_deposit'
  | 'awaiting_signatures'
  | 'active'
  | 'disputed'
  | 'settled'
  | 'expired'
  | 'dispute_resolved_tenant'
  | 'dispute_resolved_landlord';

export interface Order {
  id: string;
  conversation_id: string;
  property_id: string;
  tenant_id: string;
  landlord_id: string;
  created_by: string;
  deposit_amount: number;
  rent_amount: number;
  token_mint: string;
  escrow_status: OrderStatus;
  escrow_address: string;
  tenant_signed: boolean;
  landlord_signed: boolean;
  sign_deadline: string;
  rent_start_date: string;
  rent_end_date: string;
  dispute_reason: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  conversation_id: string;
  property_id: string;
  landlord_id: string;
  deposit_amount: number;
  rent_amount: number;
  token_mint: string;
  escrow_address: string;
  rent_start_date: string;
  rent_end_date: string;
  sign_deadline_days: number;
}

export interface OrderUpdateEvent {
  type: string;
  order_id: string;
  status: OrderStatus;
  order: Order;
}
```

- [ ] **Step 2: Create order API functions**

Create `frontend/src/features/orders/api.ts`:

```typescript
import { apiFetch } from '../../lib/api';
import type { Order, CreateOrderRequest } from './types';

export function createOrder(data: CreateOrderRequest, token: string): Promise<Order> {
  return apiFetch<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function acceptOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}/accept`, {
    method: 'POST',
  }, token);
}

export function rejectOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}/reject`, {
    method: 'POST',
  }, token);
}

export function listOrdersByConversation(conversationId: string, token: string): Promise<Order[]> {
  return apiFetch<Order[]>(`/orders?conversation_id=${encodeURIComponent(conversationId)}`, {}, token);
}

export function getOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}`, {}, token);
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add frontend/src/features/orders/
git commit -m "feat(frontend): add order types and API layer"
```

---

## Task 8: Frontend — Order Centrifugo Hook

**Files:**
- Create: `frontend/src/features/orders/hooks/useOrderUpdates.ts`

- [ ] **Step 1: Create the order updates hook**

Create `frontend/src/features/orders/hooks/useOrderUpdates.ts`:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import type { Centrifuge, Subscription } from 'centrifuge';
import { useToastStore } from '../../toast/store';
import { listOrdersByConversation } from '../api';
import { useAuthStore } from '../../auth/store';
import type { Order, OrderUpdateEvent } from '../types';

export function useOrderUpdates(
  centrifugoRef: React.RefObject<Centrifuge | null>,
  conversationId: string | null,
) {
  const { token, user } = useAuthStore();
  const { addToast } = useToastStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const subRef = useRef<Subscription | null>(null);
  const currentUserId = user?.id || '';

  // Load orders for conversation
  const loadOrders = useCallback(async () => {
    if (!conversationId || !token) return;
    try {
      const result = await listOrdersByConversation(conversationId, token);
      setOrders(result);
    } catch {
      setOrders([]);
    }
  }, [conversationId, token]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Subscribe to order updates via Centrifugo
  useEffect(() => {
    const client = centrifugoRef.current;
    if (!client || !conversationId) return;

    const channel = `orders:${conversationId}`;
    const sub = client.newSubscription(channel);

    sub.on('publication', (ctx) => {
      const evt = ctx.data as OrderUpdateEvent;

      // Update local orders state
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === evt.order_id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = evt.order;
          return updated;
        }
        return [evt.order, ...prev];
      });

      // Show toast based on event type
      const isMe = evt.order.created_by === currentUserId;
      switch (evt.type) {
        case 'order_created':
          if (!isMe) {
            addToast({ variant: 'info', title: 'New Order Proposal', message: `${evt.order.rent_amount} SOL/period` });
          }
          break;
        case 'order_accepted':
          addToast({ variant: 'success', title: 'Order Accepted', message: 'Waiting for tenant to lock deposit' });
          break;
        case 'order_rejected':
          addToast({ variant: 'error', title: 'Order Rejected' });
          break;
        case 'deposit_locked':
          addToast({ variant: 'onchain', title: 'Deposit Locked On-Chain', message: 'Ready for signatures' });
          break;
        case 'party_signed':
          addToast({ variant: 'onchain', title: 'Order Signed', message: `${evt.order.tenant_signed ? '✓' : '○'} Tenant  ${evt.order.landlord_signed ? '✓' : '○'} Landlord` });
          break;
        case 'order_activated':
          addToast({ variant: 'success', title: 'Order Active', message: 'Both parties signed — order is live' });
          break;
        case 'order_expired':
          addToast({ variant: 'error', title: 'Order Expired', message: 'Sign deadline passed' });
          break;
      }
    });

    sub.subscribe();
    subRef.current = sub;

    return () => {
      sub.unsubscribe();
      sub.removeAllListeners();
      subRef.current = null;
    };
  }, [centrifugoRef, conversationId, currentUserId, addToast]);

  return { orders, setOrders, loadOrders };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add frontend/src/features/orders/hooks/
git commit -m "feat(frontend): add useOrderUpdates Centrifugo hook"
```

---

## Task 9: Frontend — CreateOrderModal

**Files:**
- Create: `frontend/src/features/orders/components/CreateOrderModal.tsx`

- [ ] **Step 1: Create the modal component**

Create `frontend/src/features/orders/components/CreateOrderModal.tsx`:

```tsx
import { useState } from 'react';
import { createOrder } from '../api';
import { useAuthStore } from '../../auth/store';
import { useToastStore } from '../../toast/store';
import type { Conversation } from '../../chat/types';
import type { Property } from '../../properties/types';

interface CreateOrderModalProps {
  conversation: Conversation;
  property: Property | null;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateOrderModal({ conversation, property, onClose, onCreated }: CreateOrderModalProps) {
  const { token } = useAuthStore();
  const { addToast } = useToastStore();
  const [depositAmount, setDepositAmount] = useState('');
  const [rentAmount, setRentAmount] = useState(property ? String(property.price) : '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tokenMint, setTokenMint] = useState('SOL');
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!token || !rentAmount || !depositAmount || !startDate || !endDate) return;

    setSubmitting(true);
    try {
      await createOrder({
        conversation_id: conversation.id,
        property_id: conversation.property_id,
        landlord_id: conversation.landlord_id,
        deposit_amount: Number(depositAmount),
        rent_amount: Number(rentAmount),
        token_mint: tokenMint,
        escrow_address: '',
        rent_start_date: new Date(startDate).toISOString(),
        rent_end_date: new Date(endDate).toISOString(),
        sign_deadline_days: Number(deadlineDays),
      }, token);

      addToast({ variant: 'success', title: 'Order Created', message: 'Waiting for response' });
      onCreated();
      onClose();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to create order', message: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#141416', borderRadius: 16, padding: 24,
          width: '90%', maxWidth: 420, border: '1px solid rgba(255,255,255,0.07)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginBottom: 20, fontFamily: "'Syne', sans-serif" }}>
          Create Order
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Rent Amount */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>
              Rent Amount
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                placeholder="0"
                style={{
                  flex: 1, padding: '10px 14px', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#e2e8f0', fontSize: 14,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9945FF', fontWeight: 600, fontSize: 13 }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#9945FF"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text></svg>
                SOL
              </div>
            </div>
          </div>

          {/* Deposit Amount */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>
              Deposit Amount
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0"
                style={{
                  flex: 1, padding: '10px 14px', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#e2e8f0', fontSize: 14,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9945FF', fontWeight: 600, fontSize: 13 }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#9945FF"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text></svg>
                SOL
              </div>
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#e2e8f0', fontSize: 14,
              }}
            />
          </div>

          {/* End Date */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#e2e8f0', fontSize: 14,
              }}
            />
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none', border: 'none', color: '#E07840', fontSize: 12,
              cursor: 'pointer', textAlign: 'left', padding: 0,
            }}
          >
            {showAdvanced ? '▾ Hide Advanced' : '▸ Advanced Options'}
          </button>

          {showAdvanced && (
            <>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Token</label>
                <select
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, color: '#e2e8f0', fontSize: 14,
                  }}
                >
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Sign Deadline (days)</label>
                <input
                  type="number"
                  value={deadlineDays}
                  onChange={(e) => setDeadlineDays(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, color: '#e2e8f0', fontSize: 14,
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: 10, background: 'transparent', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !rentAmount || !depositAmount || !startDate || !endDate}
            style={{
              flex: 1, padding: 10, background: '#E07840', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add frontend/src/features/orders/components/CreateOrderModal.tsx
git commit -m "feat(frontend): add CreateOrderModal component"
```

---

## Task 10: Frontend — OrderCard Component

**Files:**
- Create: `frontend/src/features/orders/components/OrderCard.tsx`

- [ ] **Step 1: Create the inline order card**

Create `frontend/src/features/orders/components/OrderCard.tsx`:

```tsx
import { useState } from 'react';
import { acceptOrder, rejectOrder } from '../api';
import { useAuthStore } from '../../auth/store';
import { useToastStore } from '../../toast/store';
import { useLockDeposit } from '../../escrow/hooks/useLockDeposit';
import { useTenantSign } from '../../escrow/hooks/useTenantSign';
import { useLandlordSign } from '../../escrow/hooks/useLandlordSign';
import type { Order, OrderStatus } from '../types';

interface OrderCardProps {
  order: Order;
  onUpdated: () => void;
}

const statusColors: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  new: { bg: 'rgba(224,120,64,0.15)', text: '#E07840', border: 'rgba(224,120,64,0.3)' },
  rejected: { bg: 'rgba(255,77,106,0.15)', text: '#FF4D6A', border: 'rgba(255,77,106,0.2)' },
  awaiting_deposit: { bg: 'rgba(224,120,64,0.15)', text: '#E07840', border: 'rgba(224,120,64,0.3)' },
  awaiting_signatures: { bg: 'rgba(224,120,64,0.15)', text: '#E07840', border: 'rgba(224,120,64,0.3)' },
  active: { bg: 'rgba(61,214,140,0.15)', text: '#3DD68C', border: 'rgba(61,214,140,0.3)' },
  disputed: { bg: 'rgba(255,77,106,0.15)', text: '#FF4D6A', border: 'rgba(255,77,106,0.2)' },
  settled: { bg: 'rgba(61,214,140,0.1)', text: '#3DD68C', border: 'rgba(61,214,140,0.2)' },
  expired: { bg: 'rgba(255,77,106,0.1)', text: '#FF4D6A', border: 'rgba(255,77,106,0.15)' },
  dispute_resolved_tenant: { bg: 'rgba(61,214,140,0.1)', text: '#3DD68C', border: 'rgba(61,214,140,0.2)' },
  dispute_resolved_landlord: { bg: 'rgba(61,214,140,0.1)', text: '#3DD68C', border: 'rgba(61,214,140,0.2)' },
};

const statusLabels: Record<OrderStatus, string> = {
  new: 'NEW',
  rejected: 'REJECTED',
  awaiting_deposit: 'AWAITING DEPOSIT',
  awaiting_signatures: 'AWAITING SIGNATURES',
  active: 'ACTIVE',
  disputed: 'DISPUTED',
  settled: 'SETTLED',
  expired: 'EXPIRED',
  dispute_resolved_tenant: 'RESOLVED (TENANT)',
  dispute_resolved_landlord: 'RESOLVED (LANDLORD)',
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export function OrderCard({ order, onUpdated }: OrderCardProps) {
  const { token, user } = useAuthStore();
  const { addToast } = useToastStore();
  const { lockDeposit } = useLockDeposit();
  const { tenantSign } = useTenantSign();
  const { landlordSign } = useLandlordSign();
  const [loading, setLoading] = useState(false);

  const currentUserId = user?.id || '';
  const isTenant = currentUserId === order.tenant_id;
  const colors = statusColors[order.escrow_status];
  const isTerminal = ['rejected', 'expired', 'settled', 'dispute_resolved_tenant', 'dispute_resolved_landlord'].includes(order.escrow_status);

  const handleAccept = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await acceptOrder(order.id, token);
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to accept', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await rejectOrder(order.id, token);
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to reject', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const handleLockDeposit = async () => {
    setLoading(true);
    try {
      await lockDeposit({
        orderId: order.id,
        landlordPubkey: order.landlord_id,
        authorityPubkey: order.landlord_id,
        depositLamports: order.deposit_amount,
        deadlineTs: Math.floor(new Date(order.sign_deadline).getTime() / 1000),
      });
      addToast({ variant: 'onchain', title: 'Deposit Locked', message: 'Transaction confirmed' });
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Deposit failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    setLoading(true);
    try {
      if (isTenant) {
        await tenantSign({ landlordPubkey: order.landlord_id, orderId: order.id });
      } else {
        await landlordSign({ tenantPubkey: order.tenant_id, orderId: order.id });
      }
      addToast({ variant: 'onchain', title: 'Order Signed', message: 'Transaction confirmed' });
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Signing failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const alreadySigned = isTenant ? order.tenant_signed : order.landlord_signed;

  return (
    <div style={{
      margin: '16px auto', maxWidth: 380, padding: 16, background: '#141416',
      border: `1px solid ${colors.border}`, borderRadius: 12,
      opacity: isTerminal ? 0.6 : 1,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <span style={{ color: colors.text, fontWeight: 600, fontSize: 13 }}>Order Proposal</span>
        </div>
        <span style={{ background: colors.bg, color: colors.text, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
          {statusLabels[order.escrow_status]}
        </span>
      </div>

      {/* Details */}
      <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Rent:</span>
          <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#9945FF"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text></svg>
            {order.rent_amount} SOL
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Deposit:</span>
          <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#9945FF"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text></svg>
            {order.deposit_amount} SOL
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Period:</span>
          <span style={{ color: '#e2e8f0' }}>{formatDate(order.rent_start_date)} – {formatDate(order.rent_end_date)}</span>
        </div>
      </div>

      {/* Signature progress (awaiting_signatures) */}
      {order.escrow_status === 'awaiting_signatures' && (
        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
          <span style={{ color: order.tenant_signed ? '#3DD68C' : '#E07840' }}>{order.tenant_signed ? '✓' : '○'} Tenant</span>
          <span style={{ marginLeft: 12, color: order.landlord_signed ? '#3DD68C' : '#E07840' }}>{order.landlord_signed ? '✓' : '○'} Landlord</span>
        </div>
      )}

      {/* Action buttons */}
      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {order.escrow_status === 'new' && (
            <>
              <button onClick={handleAccept} disabled={loading} style={{
                flex: 1, padding: 8, background: '#3DD68C', color: '#0a0a0f',
                border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                opacity: loading ? 0.6 : 1,
              }}>Accept</button>
              <button onClick={handleReject} disabled={loading} style={{
                flex: 1, padding: 8, background: 'transparent', color: '#FF4D6A',
                border: '1px solid #FF4D6A', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                opacity: loading ? 0.6 : 1,
              }}>Reject</button>
            </>
          )}
          {order.escrow_status === 'awaiting_deposit' && isTenant && (
            <button onClick={handleLockDeposit} disabled={loading} style={{
              width: '100%', padding: 8, background: '#E07840', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}>Lock Deposit On-Chain</button>
          )}
          {order.escrow_status === 'awaiting_signatures' && !alreadySigned && (
            <button onClick={handleSign} disabled={loading} style={{
              width: '100%', padding: 8, background: '#E07840', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}>Sign Order On-Chain</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add frontend/src/features/orders/components/OrderCard.tsx
git commit -m "feat(frontend): add OrderCard inline component with actions"
```

---

## Task 11: Frontend — OrdersPanel Component

**Files:**
- Create: `frontend/src/features/orders/components/OrdersPanel.tsx`

- [ ] **Step 1: Create the side panel**

Create `frontend/src/features/orders/components/OrdersPanel.tsx`:

```tsx
import type { Order, OrderStatus } from '../types';

interface OrdersPanelProps {
  orders: Order[];
  onClose: () => void;
}

const statusLabels: Record<OrderStatus, string> = {
  new: 'NEW',
  rejected: 'REJECTED',
  awaiting_deposit: 'DEPOSIT',
  awaiting_signatures: 'AWAITING SIGS',
  active: 'ACTIVE',
  disputed: 'DISPUTED',
  settled: 'SETTLED',
  expired: 'EXPIRED',
  dispute_resolved_tenant: 'RESOLVED',
  dispute_resolved_landlord: 'RESOLVED',
};

const statusColor = (s: OrderStatus): string => {
  switch (s) {
    case 'active': case 'settled': case 'dispute_resolved_tenant': case 'dispute_resolved_landlord': return '#3DD68C';
    case 'rejected': case 'expired': case 'disputed': return '#FF4D6A';
    default: return '#E07840';
  }
};

const isTerminal = (s: OrderStatus) =>
  ['rejected', 'expired', 'settled', 'dispute_resolved_tenant', 'dispute_resolved_landlord'].includes(s);

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export function OrdersPanel({ orders, onClose }: OrdersPanelProps) {
  const activeOrders = orders.filter((o) => !isTerminal(o.escrow_status));

  return (
    <div style={{
      width: 260, background: '#111118', borderLeft: '1px solid rgba(255,255,255,0.07)',
      padding: 16, overflowY: 'auto', flexShrink: 0,
    }}>
      <div style={{
        color: '#E07840', fontWeight: 600, fontSize: 13, marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Orders</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>

      {orders.length === 0 ? (
        <div style={{ color: '#6A6A7A', fontSize: 13, textAlign: 'center', padding: 20 }}>
          No orders yet
        </div>
      ) : (
        <>
          {orders.map((order, idx) => {
            const color = statusColor(order.escrow_status);
            const terminal = isTerminal(order.escrow_status);
            return (
              <div key={order.id} style={{
                padding: 12, background: '#141416', borderRadius: 8,
                border: `1px solid ${terminal ? 'rgba(255,255,255,0.05)' : color + '33'}`,
                marginBottom: 10, opacity: terminal ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>Order #{orders.length - idx}</span>
                  <span style={{ color, fontSize: 10, fontWeight: 600 }}>{statusLabels[order.escrow_status]}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#9945FF"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text></svg>
                    {order.rent_amount} SOL · {order.deposit_amount} SOL deposit
                  </div>
                  <div>{formatDate(order.rent_start_date)} – {formatDate(order.rent_end_date)}</div>
                  {order.escrow_status === 'awaiting_signatures' && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: order.tenant_signed ? '#3DD68C' : '#E07840', fontSize: 10 }}>{order.tenant_signed ? '✓' : '○'} Tenant</span>
                      <span style={{ marginLeft: 6, color: order.landlord_signed ? '#3DD68C' : '#E07840', fontSize: 10 }}>{order.landlord_signed ? '✓' : '○'} Landlord</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Total orders:</span><span style={{ color: '#e2e8f0' }}>{orders.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Active:</span><span style={{ color: '#3DD68C' }}>{activeOrders.length} in progress</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add frontend/src/features/orders/components/OrdersPanel.tsx
git commit -m "feat(frontend): add OrdersPanel side panel component"
```

---

## Task 12: Frontend — Integrate Orders into ChatWindow

**Files:**
- Modify: `frontend/src/features/chat/components/ChatWindow.tsx`

- [ ] **Step 1: Add imports for order components**

At the top of `ChatWindow.tsx`, add:

```typescript
import { useOrderUpdates } from '../../orders/hooks/useOrderUpdates';
import { CreateOrderModal } from '../../orders/components/CreateOrderModal';
import { OrderCard } from '../../orders/components/OrderCard';
import { OrdersPanel } from '../../orders/components/OrdersPanel';
import { apiFetch } from '../../../lib/api';
import type { Property } from '../../properties/types';
```

- [ ] **Step 2: Add order state and property fetching to the selected conversation view**

Inside `ChatWindow`, add state for orders panel, modal, and property. These should be added right after the existing state declarations:

```typescript
const [showOrderModal, setShowOrderModal] = useState(false);
const [showOrdersPanel, setShowOrdersPanel] = useState(false);
const [property, setProperty] = useState<Property | null>(null);
```

- [ ] **Step 3: Wire up useOrderUpdates hook**

Add after the `useChat` hook call:

```typescript
const { orders, loadOrders } = useOrderUpdates(centrifugoRef, activeConv?.id || null);
```

- [ ] **Step 4: Fetch property when conversation is selected**

Add a useEffect to load the property data for the selected conversation:

```typescript
useEffect(() => {
  if (!selectedConversation) return;
  apiFetch<Property>(`/properties/${selectedConversation.property_id}`)
    .then(setProperty)
    .catch(() => setProperty(null));
}, [selectedConversation?.property_id]);
```

- [ ] **Step 5: Update the selected conversation chat header**

Replace the existing header section in the selected conversation view (the `div` with the Back button) with one that includes the order buttons. Find the header div and replace it:

```tsx
<div style={{ flexShrink: 0, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <button onClick={() => setSelectedConversation(null)} style={{ background: 'none', border: 'none', color: '#E07840', fontSize: 16, cursor: 'pointer', marginRight: 16 }}>
        &larr; Back
      </button>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
          {property?.title || `Property: ${selectedConversation.property_id.slice(0, 8)}...`}
        </p>
        <p style={{ fontSize: 12, color: '#6A6A7A' }}>
          {property ? `${property.price} SOL/${property.period_type}` : ''}
          {' · '}
          {isLandlord(selectedConversation)
            ? `Loaner: ${shortWallet(selectedConversation.loaner_id)}`
            : `Landlord: ${shortWallet(selectedConversation.landlord_id)}`}
        </p>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => setShowOrderModal(true)}
        style={{
          padding: '6px 12px', background: 'rgba(224,120,64,0.15)', color: '#E07840',
          border: '1px solid rgba(224,120,64,0.3)', borderRadius: 6, fontSize: 12,
          cursor: 'pointer', fontWeight: 600,
        }}
      >
        + Create Order
      </button>
      <button
        onClick={() => setShowOrdersPanel(!showOrdersPanel)}
        style={{
          padding: '6px 12px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12, cursor: 'pointer',
        }}
      >
        📋 Orders {orders.length > 0 && (
          <span style={{
            background: '#E07840', color: 'white', padding: '1px 5px',
            borderRadius: 10, fontSize: 10, marginLeft: 4,
          }}>{orders.length}</span>
        )}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Add order cards and side panel to the chat body**

Update the main chat body area to include a flex layout with the optional side panel. The chat content and side panel should be siblings in a flex row. Find the existing content area and wrap it:

```tsx
<div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <MessageList
      messages={messages}
      currentUserId={currentUserId}
      onLoadMore={loadMore}
    />
    {/* Render order cards after messages */}
    {orders.map((order) => (
      <OrderCard key={order.id} order={order} onUpdated={loadOrders} />
    ))}
    <MessageInput onSend={sendMessage} />
  </div>
  {showOrdersPanel && (
    <OrdersPanel orders={orders} onClose={() => setShowOrdersPanel(false)} />
  )}
</div>
```

Note: The order cards rendering inside the chat scroll area is a simplification. In a production version, you'd interleave them with messages by timestamp. For now, showing them below messages works as a starting point.

- [ ] **Step 7: Add the CreateOrderModal render**

At the end of the selected conversation return block (before the closing `</div>`), add:

```tsx
{showOrderModal && selectedConversation && (
  <CreateOrderModal
    conversation={selectedConversation}
    property={property}
    onClose={() => setShowOrderModal(false)}
    onCreated={loadOrders}
  />
)}
```

- [ ] **Step 8: Verify frontend compiles**

Run: `cd /Users/abdro/Desktop/DecentraRent/frontend && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add frontend/src/features/chat/components/ChatWindow.tsx
git commit -m "feat(frontend): integrate orders into ChatWindow with modal, cards, and side panel"
```

---

## Task 13: Verify Full Build

**Files:** None (verification only)

- [ ] **Step 1: Verify backend compiles**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: PASS

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/abdro/Desktop/DecentraRent/frontend && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Run frontend dev build**

Run: `cd /Users/abdro/Desktop/DecentraRent/frontend && npx vite build`

Expected: PASS — bundle produced with no errors

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
cd /Users/abdro/Desktop/DecentraRent
git add -A
git commit -m "fix: address build issues from order-chat integration"
```
