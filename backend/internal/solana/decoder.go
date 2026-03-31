package solana

import (
	"encoding/base64"
	"encoding/binary"
	"strings"

	"github.com/mr-tron/base58"
)

const programDataPrefix = "Program data: "

// DecodeEvents scans log messages for Anchor "Program data:" lines,
// decodes them, and returns any recognized events.
func DecodeEvents(logs []string, txSignature string) []DecodedEvent {
	var events []DecodedEvent

	for _, line := range logs {
		if !strings.HasPrefix(line, programDataPrefix) {
			continue
		}

		b64 := strings.TrimPrefix(line, programDataPrefix)
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil || len(data) < 8 {
			continue
		}

		var disc [8]byte
		copy(disc[:], data[:8])
		body := data[8:]

		topic, ok := discriminatorToTopic[disc]
		if !ok {
			continue
		}

		evt, escrow := decodeBody(disc, body, txSignature)
		if evt == nil {
			continue
		}

		events = append(events, DecodedEvent{
			Topic:   topic,
			Key:     escrow,
			Payload: evt,
		})
	}

	return events
}

func decodeBody(disc [8]byte, data []byte, txSig string) (interface{}, string) {
	switch disc {
	case DiscriminatorDepositLocked:
		return decodeDepositLocked(data, txSig)
	case DiscriminatorPartySigned:
		return decodePartySigned(data, txSig)
	case DiscriminatorEscrowExpired:
		return decodeEscrowExpired(data, txSig)
	default:
		return nil, ""
	}
}

// --- Borsh decoders ---
// Pubkey: 32 bytes → base58 string
// u64:    8 bytes little-endian
// i64:    8 bytes little-endian
// String: 4 bytes LE length + UTF-8 bytes

func readPubkey(data []byte, offset int) (string, int) {
	if offset+32 > len(data) {
		return "", offset
	}
	return base58.Encode(data[offset : offset+32]), offset + 32
}

func readU64(data []byte, offset int) (uint64, int) {
	if offset+8 > len(data) {
		return 0, offset
	}
	return binary.LittleEndian.Uint64(data[offset : offset+8]), offset + 8
}

func readI64(data []byte, offset int) (int64, int) {
	if offset+8 > len(data) {
		return 0, offset
	}
	return int64(binary.LittleEndian.Uint64(data[offset : offset+8])), offset + 8
}

func readString(data []byte, offset int) (string, int) {
	if offset+4 > len(data) {
		return "", offset
	}
	length := int(binary.LittleEndian.Uint32(data[offset : offset+4]))
	offset += 4
	if offset+length > len(data) {
		return "", offset
	}
	return string(data[offset : offset+length]), offset + length
}

// DepositLocked: escrow(Pubkey) + landlord(Pubkey) + tenant(Pubkey) + deposit_amount(u64) + deadline(i64)
func decodeDepositLocked(data []byte, txSig string) (*SolanaDepositLockedEvent, string) {
	off := 0
	escrow, off := readPubkey(data, off)
	landlord, off := readPubkey(data, off)
	tenant, off := readPubkey(data, off)
	depositAmount, off := readU64(data, off)
	deadline, _ := readI64(data, off)

	if escrow == "" {
		return nil, ""
	}

	return &SolanaDepositLockedEvent{
		Escrow:        escrow,
		Landlord:      landlord,
		Tenant:        tenant,
		DepositAmount: depositAmount,
		Deadline:      deadline,
		TxSignature:   txSig,
	}, escrow
}

// PartySignedEvent: escrow(Pubkey) + signer(Pubkey) + role(String)
func decodePartySigned(data []byte, txSig string) (*SolanaPartySignedEvent, string) {
	off := 0
	escrow, off := readPubkey(data, off)
	signer, off := readPubkey(data, off)
	role, _ := readString(data, off)

	if escrow == "" {
		return nil, ""
	}

	return &SolanaPartySignedEvent{
		Escrow:      escrow,
		Signer:      signer,
		Role:        role,
		TxSignature: txSig,
	}, escrow
}

// EscrowExpired: escrow(Pubkey) + refunded_to(Pubkey) + amount(u64)
func decodeEscrowExpired(data []byte, txSig string) (*SolanaEscrowExpiredEvent, string) {
	off := 0
	escrow, off := readPubkey(data, off)
	refundedTo, off := readPubkey(data, off)
	amount, _ := readU64(data, off)

	if escrow == "" {
		return nil, ""
	}

	return &SolanaEscrowExpiredEvent{
		Escrow:      escrow,
		RefundedTo:  refundedTo,
		Amount:      amount,
		TxSignature: txSig,
	}, escrow
}
