package chat

import "time"

// ─── Message types ──────────────────────────────────────────────────

const (
	MessageTypeText     = "text"      // обычное текстовое сообщение
	MessageTypeSystem   = "system"    // системное уведомление
	MessageTypeDocument = "document"  // договор / документ (PDF и т.д.)
	MessageTypeModal    = "modal"     // модалка с действиями (принять/отклонить)
)

// ─── Modal action types ─────────────────────────────────────────────

const (
	ModalActionCreateAgreement = "create_agreement" // модалка "Создаём договор?"
	ModalActionSignAgreement   = "sign_agreement"   // модалка "Подписываем договор?"
	ModalActionDepositConfirm  = "deposit_confirm"  // модалка "Подтвердить списание депозита?"
)

// ─── Modal statuses ─────────────────────────────────────────────────

const (
	ModalStatusPending  = "pending"   // ожидает действия
	ModalStatusAccepted = "accepted"  // принято ✅
	ModalStatusRejected = "rejected"  // отклонено ❌
	ModalStatusExpired  = "expired"   // истекло
)

// ─── Entities ───────────────────────────────────────────────────────

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
	ID             string          `json:"id"`
	ConversationID string          `json:"conversation_id"`
	SenderID       string          `json:"sender_id"`
	Content        string          `json:"content"`
	MessageType    string          `json:"message_type"`
	Metadata       *MessageMeta    `json:"metadata,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

// MessageMeta carries extra data depending on message_type.
type MessageMeta struct {
	// Для document
	DocumentURL  string `json:"document_url,omitempty"`
	DocumentName string `json:"document_name,omitempty"`
	OrderID      string `json:"order_id,omitempty"`

	// Для modal
	ModalAction string `json:"modal_action,omitempty"` // create_agreement, sign_agreement, deposit_confirm
	ModalStatus string `json:"modal_status,omitempty"` // pending, accepted, rejected
	ModalID     string `json:"modal_id,omitempty"`     // unique ID для отслеживания ответа

	// Для system
	EventType string `json:"event_type,omitempty"` // order.created, order.signed, etc.
}
