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

// ParseChannel extracts property ID and loaner wallet from channel name.
// Channel format: property:<property_id>:chat:<loaner_wallet>
func ParseChannel(channel string) (propertyID, loanerWallet string, err error) {
	parts := strings.Split(channel, ":")
	if len(parts) != 4 || parts[0] != "property" || parts[2] != "chat" {
		return "", "", fmt.Errorf("invalid channel format: %s", channel)
	}
	return parts[1], parts[3], nil
}

// CanSubscribe checks if a wallet is allowed to subscribe to a channel.
func (s *Service) CanSubscribe(channel, walletAddress string) error {
	propertyID, loanerWallet, err := ParseChannel(channel)
	if err != nil {
		return err
	}

	// The loaner named in the channel can subscribe
	if walletAddress == loanerWallet {
		return nil
	}

	// The landlord can subscribe — check if a conversation exists for this property
	conv, err := s.store.GetOrCreateConversation(propertyID, walletAddress, loanerWallet)
	if err != nil {
		return fmt.Errorf("failed to verify subscription: %w", err)
	}

	if conv.LandlordWallet == walletAddress {
		return nil
	}

	return fmt.Errorf("not authorized to subscribe to channel %s", channel)
}

// SaveMessage persists a chat message and returns the saved message.
func (s *Service) SaveMessage(channel, senderWallet, content string) (*Message, error) {
	propertyID, loanerWallet, err := ParseChannel(channel)
	if err != nil {
		return nil, err
	}

	conv, err := s.store.GetOrCreateConversation(propertyID, senderWallet, loanerWallet)
	if err != nil {
		// If sender is the landlord, try with loaner wallet
		conv, err = s.store.GetOrCreateConversation(propertyID, "", loanerWallet)
		if err != nil {
			return nil, fmt.Errorf("conversation not found: %w", err)
		}
	}

	return s.store.SaveMessage(conv.ID, senderWallet, content)
}
