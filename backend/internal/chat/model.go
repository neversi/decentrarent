package chat

import "time"

type Conversation struct {
	ID              string    `json:"id"`
	PropertyID      string    `json:"property_id"`
	LandlordWallet  string    `json:"landlord_wallet"`
	LoanerWallet    string    `json:"loaner_wallet"`
	LastMessage     *string   `json:"last_message"`
	LastMessageAt   *time.Time `json:"last_message_at"`
	CreatedAt       time.Time `json:"created_at"`
}

type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	SenderWallet   string    `json:"sender_wallet"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
}
