package chat

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS conversations (
			id TEXT PRIMARY KEY,
			property_id TEXT NOT NULL,
			landlord_wallet TEXT NOT NULL,
			loaner_wallet TEXT NOT NULL,
			last_message TEXT,
			last_message_at TIMESTAMP,
			created_at TIMESTAMP NOT NULL DEFAULT NOW(),
			UNIQUE(property_id, loaner_wallet)
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversations(id),
			sender_wallet TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
			ON messages(conversation_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_conversations_wallets
			ON conversations(landlord_wallet, loaner_wallet)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) GetOrCreateConversation(propertyID, landlordWallet, loanerWallet string) (*Conversation, error) {
	conv := &Conversation{}
	err := s.db.QueryRow(
		`SELECT id, property_id, landlord_wallet, loaner_wallet, last_message, last_message_at, created_at
		 FROM conversations WHERE property_id = $1 AND loaner_wallet = $2`,
		propertyID, loanerWallet,
	).Scan(&conv.ID, &conv.PropertyID, &conv.LandlordWallet, &conv.LoanerWallet,
		&conv.LastMessage, &conv.LastMessageAt, &conv.CreatedAt)

	if err == sql.ErrNoRows {
		conv = &Conversation{
			ID:             uuid.New().String(),
			PropertyID:     propertyID,
			LandlordWallet: landlordWallet,
			LoanerWallet:   loanerWallet,
			CreatedAt:      time.Now(),
		}
		_, err = s.db.Exec(
			`INSERT INTO conversations (id, property_id, landlord_wallet, loaner_wallet, created_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			conv.ID, conv.PropertyID, conv.LandlordWallet, conv.LoanerWallet, conv.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		return conv, nil
	}
	if err != nil {
		return nil, err
	}
	return conv, nil
}

func (s *Store) ListConversations(walletAddress string) ([]Conversation, error) {
	rows, err := s.db.Query(
		`SELECT id, property_id, landlord_wallet, loaner_wallet, last_message, last_message_at, created_at
		 FROM conversations
		 WHERE landlord_wallet = $1 OR loaner_wallet = $1
		 ORDER BY COALESCE(last_message_at, created_at) DESC`,
		walletAddress,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.PropertyID, &c.LandlordWallet, &c.LoanerWallet,
			&c.LastMessage, &c.LastMessageAt, &c.CreatedAt); err != nil {
			return nil, err
		}
		convs = append(convs, c)
	}
	return convs, nil
}

func (s *Store) SaveMessage(conversationID, senderWallet, content string) (*Message, error) {
	msg := &Message{
		ID:             uuid.New().String(),
		ConversationID: conversationID,
		SenderWallet:   senderWallet,
		Content:        content,
		CreatedAt:      time.Now(),
	}

	_, err := s.db.Exec(
		`INSERT INTO messages (id, conversation_id, sender_wallet, content, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		msg.ID, msg.ConversationID, msg.SenderWallet, msg.Content, msg.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Update conversation last_message
	_, err = s.db.Exec(
		`UPDATE conversations SET last_message = $1, last_message_at = $2 WHERE id = $3`,
		content, msg.CreatedAt, conversationID,
	)
	if err != nil {
		return nil, err
	}

	return msg, nil
}

func (s *Store) GetMessages(conversationID string, before *time.Time, limit int) ([]Message, error) {
	var rows *sql.Rows
	var err error

	if before != nil {
		rows, err = s.db.Query(
			`SELECT id, conversation_id, sender_wallet, content, created_at
			 FROM messages
			 WHERE conversation_id = $1 AND created_at < $2
			 ORDER BY created_at DESC LIMIT $3`,
			conversationID, before, limit,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, conversation_id, sender_wallet, content, created_at
			 FROM messages
			 WHERE conversation_id = $1
			 ORDER BY created_at DESC LIMIT $2`,
			conversationID, limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderWallet, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}

	// Reverse to chronological order
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	return msgs, nil
}

func (s *Store) GetConversation(id string) (*Conversation, error) {
	conv := &Conversation{}
	err := s.db.QueryRow(
		`SELECT id, property_id, landlord_wallet, loaner_wallet, last_message, last_message_at, created_at
		 FROM conversations WHERE id = $1`, id,
	).Scan(&conv.ID, &conv.PropertyID, &conv.LandlordWallet, &conv.LoanerWallet,
		&conv.LastMessage, &conv.LastMessageAt, &conv.CreatedAt)
	if err != nil {
		return nil, err
	}
	return conv, nil
}
