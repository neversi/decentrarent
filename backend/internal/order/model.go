package order

import "time"

// ─── Escrow statuses ────────────────────────────────────────────────

const (
	StatusAwaitingSignatures    = "awaiting_signatures"      // Депозит получен, ждём подписей в течение deadline
	StatusActive                = "active"                   // Оба подписали, аренда идёт, pay_rent доступен
	StatusDisputed              = "disputed"                 // Спор, депозит заморожен
	StatusExpired               = "expired"                  // Deadline прошёл без подписей, депозит возвращён
	StatusSettled               = "settled"                  // Депозит выплачен, escrow закрыт
	StatusDisputeResolvedTenant = "dispute_resolved_tenant"  // Спор решён в пользу арендатора
	StatusDisputeResolvedLord   = "dispute_resolved_landlord" // Спор решён в пользу арендодателя
)

// AllStatuses — все допустимые статусы для валидации.
var AllStatuses = map[string]bool{
	StatusAwaitingSignatures:    true,
	StatusActive:                true,
	StatusDisputed:              true,
	StatusExpired:               true,
	StatusSettled:               true,
	StatusDisputeResolvedTenant: true,
	StatusDisputeResolvedLord:   true,
}

// AllowedTransitions определяет, из какого статуса в какой можно перейти.
var AllowedTransitions = map[string][]string{
	StatusAwaitingSignatures: {StatusActive, StatusExpired},
	StatusActive:             {StatusSettled, StatusDisputed},
	StatusDisputed:           {StatusDisputeResolvedTenant, StatusDisputeResolvedLord},
	StatusExpired:            {},
	StatusSettled:            {},
	StatusDisputeResolvedTenant: {},
	StatusDisputeResolvedLord:   {},
}

// ─── Order entity ───────────────────────────────────────────────────

type Order struct {
	ID              string    `json:"id"`
	PropertyID      string    `json:"property_id"`
	TenantWallet    string    `json:"tenant_wallet"`
	LandlordWallet  string    `json:"landlord_wallet"`
	DepositAmount   int64     `json:"deposit_amount"`   // lamports / smallest unit
	RentAmount      int64     `json:"rent_amount"`      // ежемесячная арендная плата
	TokenMint       string    `json:"token_mint"`
	EscrowStatus    string    `json:"escrow_status"`
	EscrowAddress   string    `json:"escrow_address"`   // on-chain escrow PDA
	TenantSigned    bool      `json:"tenant_signed"`
	LandlordSigned  bool      `json:"landlord_signed"`
	SignDeadline    time.Time `json:"sign_deadline"`
	RentStartDate   time.Time `json:"rent_start_date"`
	RentEndDate     time.Time `json:"rent_end_date"`
	DisputeReason   string    `json:"dispute_reason"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
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
	ID        string    `json:"id"`
	OrderID   string    `json:"order_id"`
	PaidBy    string    `json:"paid_by"`
	Amount    int64     `json:"amount"`
	TxHash    string    `json:"tx_hash"`
	PeriodStart time.Time `json:"period_start"`
	PeriodEnd   time.Time `json:"period_end"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── Request / Response DTOs ────────────────────────────────────────

type CreateOrderRequest struct {
	PropertyID    string `json:"property_id"`
	LandlordWallet string `json:"landlord_wallet"`
	DepositAmount int64  `json:"deposit_amount"`
	RentAmount    int64  `json:"rent_amount"`
	TokenMint     string `json:"token_mint"`
	EscrowAddress string `json:"escrow_address"`
	RentStartDate string `json:"rent_start_date"` // RFC3339
	RentEndDate   string `json:"rent_end_date"`   // RFC3339
	SignDeadlineDays int `json:"sign_deadline_days"` // дней на подписание (default 3)
}

type SignRequest struct {
	TxHash string `json:"tx_hash"` // on-chain tx подтверждение подписи
}

type DisputeRequest struct {
	Reason string `json:"reason"`
}

type ResolveDisputeRequest struct {
	Winner string `json:"winner"` // "tenant" или "landlord"
	Reason string `json:"reason"`
}

type PayRentRequest struct {
	TxHash      string `json:"tx_hash"`
	PeriodStart string `json:"period_start"` // RFC3339
	PeriodEnd   string `json:"period_end"`   // RFC3339
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

type ListFilter struct {
	TenantWallet   string
	LandlordWallet string
	PropertyID     string
	EscrowStatus   string
	Limit          int
	Offset         int
}
