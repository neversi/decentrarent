package chat

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) GetOrCreateConversation(propertyID, landlordID, loanerID string) (*Conversation, error) {
	conv := &Conversation{}
	err := s.db.QueryRow(
		`SELECT id, property_id, landlord_id, loaner_id, last_message, last_message_at, created_at
		 FROM conversations WHERE property_id = $1 AND loaner_id = $2`,
		propertyID, loanerID,
	).Scan(&conv.ID, &conv.PropertyID, &conv.LandlordID, &conv.LoanerID,
		&conv.LastMessage, &conv.LastMessageAt, &conv.CreatedAt)

	if err == sql.ErrNoRows {
		conv = &Conversation{
			ID:         uuid.New().String(),
			PropertyID: propertyID,
			LandlordID: landlordID,
			LoanerID:   loanerID,
			CreatedAt:  time.Now(),
		}
		_, err = s.db.Exec(
			`INSERT INTO conversations (id, property_id, landlord_id, loaner_id, created_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			conv.ID, conv.PropertyID, conv.LandlordID, conv.LoanerID, conv.CreatedAt,
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

func (s *Store) ListConversations(userID string) ([]Conversation, error) {
	rows, err := s.db.Query(
		`SELECT id, property_id, landlord_id, loaner_id, last_message, last_message_at, created_at
		 FROM conversations
		 WHERE landlord_id = $1 OR loaner_id = $1
		 ORDER BY COALESCE(last_message_at, created_at) DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.PropertyID, &c.LandlordID, &c.LoanerID,
			&c.LastMessage, &c.LastMessageAt, &c.CreatedAt); err != nil {
			return nil, err
		}
		convs = append(convs, c)
	}
	return convs, nil
}

// SaveMessage saves a regular text message.
func (s *Store) SaveMessage(conversationID, senderID, content string) (*Message, error) {
	return s.SaveTypedMessage(conversationID, senderID, content, MessageTypeText, nil)
}

// SaveTypedMessage saves a message with a specific type and optional metadata.
func (s *Store) SaveTypedMessage(conversationID, senderID, content, messageType string, meta *MessageMeta) (*Message, error) {
	msg := &Message{
		ID:             uuid.New().String(),
		ConversationID: conversationID,
		SenderID:       senderID,
		Content:        content,
		MessageType:    messageType,
		Metadata:       meta,
		CreatedAt:      time.Now(),
	}

	var metaJSON []byte
	if meta != nil {
		var err error
		metaJSON, err = json.Marshal(meta)
		if err != nil {
			return nil, err
		}
	}

	_, err := s.db.Exec(
		`INSERT INTO messages (id, conversation_id, sender_id, content, message_type, metadata, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		msg.ID, msg.ConversationID, msg.SenderID, msg.Content, msg.MessageType, metaJSON, msg.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

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
			`SELECT id, conversation_id, sender_id, content, message_type, metadata, created_at
			 FROM messages
			 WHERE conversation_id = $1 AND created_at < $2
			 ORDER BY created_at DESC LIMIT $3`,
			conversationID, before, limit,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, conversation_id, sender_id, content, message_type, metadata, created_at
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
		var metaJSON sql.NullString
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.MessageType, &metaJSON, &m.CreatedAt); err != nil {
			return nil, err
		}
		if metaJSON.Valid && metaJSON.String != "" {
			var meta MessageMeta
			if err := json.Unmarshal([]byte(metaJSON.String), &meta); err == nil {
				m.Metadata = &meta
			}
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
		`SELECT id, property_id, landlord_id, loaner_id, last_message, last_message_at, created_at
		 FROM conversations WHERE id = $1`, id,
	).Scan(&conv.ID, &conv.PropertyID, &conv.LandlordID, &conv.LoanerID,
		&conv.LastMessage, &conv.LastMessageAt, &conv.CreatedAt)
	if err != nil {
		return nil, err
	}
	return conv, nil
}

// FindConversationByPropertyAndUsers finds a conversation by property and participants.
func (s *Store) FindConversationByPropertyAndUsers(propertyID, landlordID, loanerID string) (*Conversation, error) {
	conv := &Conversation{}
	err := s.db.QueryRow(
		`SELECT id, property_id, landlord_id, loaner_id, last_message, last_message_at, created_at
		 FROM conversations
		 WHERE property_id = $1 AND (landlord_id = $2 OR loaner_id = $3)
		 LIMIT 1`,
		propertyID, landlordID, loanerID,
	).Scan(&conv.ID, &conv.PropertyID, &conv.LandlordID, &conv.LoanerID,
		&conv.LastMessage, &conv.LastMessageAt, &conv.CreatedAt)
	if err != nil {
		return nil, err
	}
	return conv, nil
}

// UpdateModalStatus updates the modal_status in a message's metadata.
func (s *Store) UpdateModalStatus(messageID, newStatus string) error {
	// Read current metadata
	var metaJSON sql.NullString
	err := s.db.QueryRow(`SELECT metadata FROM messages WHERE id = $1`, messageID).Scan(&metaJSON)
	if err != nil {
		return err
	}

	var meta MessageMeta
	if metaJSON.Valid && metaJSON.String != "" {
		if err := json.Unmarshal([]byte(metaJSON.String), &meta); err != nil {
			return err
		}
	}

	meta.ModalStatus = newStatus
	updated, err := json.Marshal(meta)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(`UPDATE messages SET metadata = $1 WHERE id = $2`, updated, messageID)
	return err
}
