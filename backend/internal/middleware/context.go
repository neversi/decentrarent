package middleware

import "context"

type contextKey string

const (
	UserIDKey        contextKey = "user_id"
	WalletAddressKey contextKey = "wallet_address"
)

func GetUserID(ctx context.Context) string {
	v, _ := ctx.Value(UserIDKey).(string)
	return v
}

func GetWalletAddress(ctx context.Context) string {
	v, _ := ctx.Value(WalletAddressKey).(string)
	return v
}

// GetIdentifier returns wallet address if available, otherwise user ID.
// Use this when you need a user identifier regardless of auth method.
func GetIdentifier(ctx context.Context) string {
	if w := GetWalletAddress(ctx); w != "" {
		return w
	}
	return GetUserID(ctx)
}
