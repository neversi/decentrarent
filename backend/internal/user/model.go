package user

import "time"

type User struct {
	ID            string    `json:"id"`
	WalletAddress string    `json:"wallet_address"`
	DisplayName   string    `json:"display_name"`
	CreatedAt     time.Time `json:"created_at"`
}
