package property

import "time"

type Property struct {
	ID                 string    `json:"id"`
	OwnerWallet        string    `json:"owner_wallet"`
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	Location           string    `json:"location"`
	Price              int64     `json:"price"`
	TokenMint          string    `json:"token_mint"`
	PeriodType         string    `json:"period_type"`
	Status             string    `json:"status"`
	VerificationStatus string    `json:"verification_status"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type CreatePropertyRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Location    string `json:"location"`
	Price       int64  `json:"price"`
	TokenMint   string `json:"token_mint"`
	PeriodType  string `json:"period_type"`
}

type UpdatePropertyRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Location    *string `json:"location"`
	Price       *int64  `json:"price"`
	TokenMint   *string `json:"token_mint"`
	PeriodType  *string `json:"period_type"`
}

type StatusRequest struct {
	Status string `json:"status"`
}

type ListFilter struct {
	Status     string
	Owner      string
	TokenMint  string
	PeriodType string
	Limit      int
	Offset     int
}
