package chat

import "time"

type Conversation struct {
	ID            string     `json:"id"`
	PropertyID    string     `json:"property_id"`
	LandlordID    string     `json:"landlord_id"`
	LoanerID      string     `json:"loaner_id"`
	LastMessage   *string    `json:"last_message"`
	LastMessageAt *time.Time `json:"last_message_at"`
	CreatedAt     time.Time  `json:"created_at"`
}

type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	SenderID       string    `json:"sender_id"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
}
