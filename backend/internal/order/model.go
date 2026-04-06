package order

import "time"

// ─── Escrow statuses ────────────────────────────────────────────────

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

// ─── Order entity ───────────────────────────────────────────────────

type Order struct {
	ID                    string    `json:"id"`
	ConversationID        string    `json:"conversation_id"`
	PropertyID            string    `json:"property_id"`
	TenantID              string    `json:"tenant_id"`
	LandlordID            string    `json:"landlord_id"`
	CreatedBy             string    `json:"created_by"`
	DepositAmount         int64     `json:"deposit_amount"`
	RentAmount            int64     `json:"rent_amount"`
	TokenMint             string    `json:"token_mint"`
	EscrowStatus          string    `json:"escrow_status"`
	EscrowAddress         string    `json:"escrow_address"`
	TenantSigned          bool      `json:"tenant_signed"`
	LandlordSigned        bool      `json:"landlord_signed"`
	SignDeadline          time.Time `json:"sign_deadline"`
	RentStartDate         time.Time `json:"rent_start_date"`
	RentEndDate           time.Time `json:"rent_end_date"`
	DisputeReason         string    `json:"dispute_reason"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
	LandlordPK            string    `json:"landlord_pk"`
	TenantPK              string    `json:"tenant_pk"`
	LandlordSignedOnchain bool      `json:"landlord_signed_onchain"`
	TenantSignedOnchain   bool      `json:"tenant_signed_onchain"`
}

// ─── Status history ─────────────────────────────────────────────────

type StatusHistory struct {
	ID         string    `json:"id"`
	OrderID    string    `json:"order_id"`
	FromStatus string    `json:"from_status"`
	ToStatus   string    `json:"to_status"`
	ChangedBy  string    `json:"changed_by"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"created_at"`
}

// ─── Rent payment ───────────────────────────────────────────────────

type RentPayment struct {
	ID          string    `json:"id"`
	OrderID     string    `json:"order_id"`
	PaidAt      time.Time `json:"paid_at"`
	Transaction string    `json:"transaction"`
	PaidAmount  int64     `json:"paid_amount"`
}

// ─── Request / Response DTOs ────────────────────────────────────────

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

type SignRequest struct {
	TxHash string `json:"tx_hash"`
}

type DisputeRequest struct {
	Reason string `json:"reason"`
}

type ResolveDisputeRequest struct {
	Winner string `json:"winner"`
	Reason string `json:"reason"`
}

type PayRentRequest struct {
	TxHash      string `json:"tx_hash"`
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
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
