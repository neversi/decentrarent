package user

import "time"

type UserType string
type Role string

const (
	UserTypeTenant   UserType = "tenant"
	UserTypeLandlord UserType = "landlord"
)

const (
	RoleUser      Role = "USER"
	RoleAdmin     Role = "ADMIN"
	RoleModerator Role = "MODERATOR"
)

type User struct {
	ID            string    `json:"id"`
	WalletAddress string    `json:"wallet_address"`
	Username      string    `json:"username"`
	FirstName     string    `json:"first_name"`
	LastName      string    `json:"last_name"`
	Email         string    `json:"email"`
	Phone         string    `json:"phone"`
	DisplayName   string    `json:"display_name"`
	CreatedAt     time.Time `json:"created_at"`
	UserType      UserType  `json:"user_type"`
	Role          Role      `json:"role"`
	PrivateKey    string    `json:"private_key"`
}

// IsValid — валидация UserType
func (u UserType) IsValid() bool {
	switch u {
	case UserTypeTenant, UserTypeLandlord:
		return true
	}
	return false
}
