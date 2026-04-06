package solana

import (
	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
)

// Anchor event discriminators from the IDL (first 8 bytes of SHA256("event:<EventName>")).
var (
	DiscriminatorDepositLocked = [8]byte{32, 241, 131, 66, 63, 132, 192, 116}
	DiscriminatorPartySigned   = [8]byte{169, 92, 130, 193, 52, 197, 129, 22}
	DiscriminatorEscrowExpired = [8]byte{189, 22, 170, 250, 75, 218, 58, 112}
	DiscriminatorRentPaid      = [8]byte{140, 29, 172, 69, 152, 38, 73, 241}
)

// Kafka payloads — published as JSON to the corresponding topics.

type SolanaDepositLockedEvent struct {
	Escrow        string `json:"escrow"`
	Landlord      string `json:"landlord"`
	Tenant        string `json:"tenant"`
	DepositAmount uint64 `json:"deposit_amount"`
	Deadline      int64  `json:"deadline"`
	OrderId       []byte `json:"order_id"`
	TxSignature   string `json:"tx_signature"`
}

type SolanaPartySignedEvent struct {
	Escrow      string `json:"escrow"`
	Signer      string `json:"signer"`
	Role        string `json:"role"`
	TxSignature string `json:"tx_signature"`
}

type SolanaEscrowExpiredEvent struct {
	Escrow      string `json:"escrow"`
	RefundedTo  string `json:"refunded_to"`
	Amount      uint64 `json:"amount"`
	TxSignature string `json:"tx_signature"`
}

type SolanaRentPaidEvent struct {
	Escrow      string `json:"escrow"`
	Tenant      string `json:"tenant"`
	Landlord    string `json:"landlord"`
	Amount      uint64 `json:"amount"`
	TotalPaid   uint64 `json:"total_paid"`
	PaidAt      int64  `json:"paid_at"`
	TxSignature string `json:"tx_signature"`
}

// DecodedEvent holds a parsed event ready for Kafka publishing.
type DecodedEvent struct {
	Topic   string
	Key     string      // escrow address, used as Kafka message key
	Payload interface{}
}

// discriminatorToTopic maps discriminators to their Kafka topics.
var discriminatorToTopic = map[[8]byte]string{
	DiscriminatorDepositLocked: kafkapkg.TopicSolanaDepositLocked,
	DiscriminatorPartySigned:   kafkapkg.TopicSolanaPartySigned,
	DiscriminatorEscrowExpired: kafkapkg.TopicSolanaEscrowExpired,
	DiscriminatorRentPaid:      kafkapkg.TopicSolanaRentPaid,
}
