package chat

import (
	"fmt"
	"strings"
)

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
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
