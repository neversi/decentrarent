package user

import "time"

type User struct {
	ID            string    `json:"id"`
	WalletAddress string    `json:"wallet_address"`
	Username      string    `json:"username"`
	FirstName     string    `json:"first_name"`
	LastName      string    `json:"last_name"`
	Email         string    `json:"email"`
	Phone         string    `json:"phone"`
	DisplayName   string    `json:"display_name"`
	IsAdmin       bool      `json:"is_admin"`
	CreatedAt     time.Time `json:"created_at"`
}
