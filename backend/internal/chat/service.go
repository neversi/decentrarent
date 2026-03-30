package chat

import (
	"fmt"
	"strings"
)

type Service struct {
	store      *Store
	centrifugo *CentrifugoClient
}

func NewService(store *Store, centrifugo *CentrifugoClient) *Service {
	return &Service{store: store, centrifugo: centrifugo}
}

// ParseChannel extracts property ID and loaner ID from channel name.
// Channel format: property:<property_id>:chat:<loaner_id>
func ParseChannel(channel string) (propertyID, loanerID string, err error) {
	parts := strings.Split(channel, ":")
	if len(parts) != 4 || parts[0] != "property" || parts[2] != "chat" {
		return "", "", fmt.Errorf("invalid channel format: %s", channel)
	}
	return parts[1], parts[3], nil
}

// CanSubscribe checks if a user is allowed to subscribe to a channel.
func (s *Service) CanSubscribe(channel, userID string) error {
	propertyID, loanerID, err := ParseChannel(channel)
	if err != nil {
		return err
	}

	if userID == loanerID {
		return nil
	}

	conv, err := s.store.GetOrCreateConversation(propertyID, userID, loanerID)
	if err != nil {
		return fmt.Errorf("failed to verify subscription: %w", err)
	}

	if conv.LandlordID == userID {
		return nil
	}

	return fmt.Errorf("not authorized to subscribe to channel %s", channel)
}

// SaveMessage persists a chat message and returns the saved message.
func (s *Service) SaveMessage(channel, senderID, content string) (*Message, error) {
	propertyID, loanerID, err := ParseChannel(channel)
	if err != nil {
		return nil, err
	}

	conv, err := s.store.GetOrCreateConversation(propertyID, senderID, loanerID)
	if err != nil {
		conv, err = s.store.GetOrCreateConversation(propertyID, "", loanerID)
		if err != nil {
			return nil, fmt.Errorf("conversation not found: %w", err)
		}
	}

	return s.store.SaveMessage(conv.ID, senderID, content)
}

// ─── System message helpers ─────────────────────────────────────────

const systemSenderID = "system"

// SendSystemMessage sends a system notification to a conversation.
// Сохраняет в БД + пушит через Centrifugo WebSocket в реалтайме.
func (s *Service) SendSystemMessage(conversationID, content, eventType string) (*Message, error) {
	meta := &MessageMeta{
		EventType: eventType,
	}
	msg, err := s.store.SaveTypedMessage(conversationID, systemSenderID, content, MessageTypeSystem, meta)
	if err != nil {
		return nil, err
	}

	s.pushToCentrifugo(conversationID, msg)
	return msg, nil
}

// SendDocumentMessage sends a document link to a conversation.
func (s *Service) SendDocumentMessage(conversationID, content, documentURL, documentName, orderID string) (*Message, error) {
	meta := &MessageMeta{
		DocumentURL:  documentURL,
		DocumentName: documentName,
		OrderID:      orderID,
	}
	msg, err := s.store.SaveTypedMessage(conversationID, systemSenderID, content, MessageTypeDocument, meta)
	if err != nil {
		return nil, err
	}

	s.pushToCentrifugo(conversationID, msg)
	return msg, nil
}

// SendModalMessage sends a modal with accept/reject actions.
func (s *Service) SendModalMessage(conversationID, content, modalAction, orderID string) (*Message, error) {
	meta := &MessageMeta{
		ModalAction: modalAction,
		ModalStatus: ModalStatusPending,
		ModalID:     fmt.Sprintf("modal-%s-%s", modalAction, orderID),
		OrderID:     orderID,
	}
	msg, err := s.store.SaveTypedMessage(conversationID, systemSenderID, content, MessageTypeModal, meta)
	if err != nil {
		return nil, err
	}

	s.pushToCentrifugo(conversationID, msg)
	return msg, nil
}

// RespondToModal updates a modal's status.
func (s *Service) RespondToModal(messageID, status string) error {
	return s.store.UpdateModalStatus(messageID, status)
}

// FindConversationForOrder finds the conversation between order participants for a property.
func (s *Service) FindConversationForOrder(propertyID, landlordWallet, tenantWallet string) (*Conversation, error) {
	conv, err := s.store.FindConversationByPropertyAndUsers(propertyID, landlordWallet, tenantWallet)
	if err == nil {
		return conv, nil
	}
	return s.store.GetOrCreateConversation(propertyID, landlordWallet, tenantWallet)
}

// pushToCentrifugo отправляет сообщение в Centrifugo для реалтайм доставки.
func (s *Service) pushToCentrifugo(conversationID string, msg *Message) {
	if s.centrifugo == nil {
		return
	}

	conv, err := s.store.GetConversation(conversationID)
	if err != nil {
		return
	}

	s.centrifugo.PublishToConversation(conv, msg)
}
