package solana

import (
	"encoding/base64"
	"encoding/binary"
	"testing"

	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
	"github.com/mr-tron/base58"
)

// helper: build a fake pubkey (32 bytes, first byte = id)
func fakePubkey(id byte) []byte {
	pk := make([]byte, 32)
	pk[0] = id
	return pk
}

func appendU64(buf []byte, v uint64) []byte {
	b := make([]byte, 8)
	binary.LittleEndian.PutUint64(b, v)
	return append(buf, b...)
}

func appendI64(buf []byte, v int64) []byte {
	b := make([]byte, 8)
	binary.LittleEndian.PutUint64(b, uint64(v))
	return append(buf, b...)
}

func appendString(buf []byte, s string) []byte {
	b := make([]byte, 4)
	binary.LittleEndian.PutUint32(b, uint32(len(s)))
	buf = append(buf, b...)
	return append(buf, []byte(s)...)
}

func buildLogLine(disc [8]byte, body []byte) string {
	data := append(disc[:], body...)
	return "Program data: " + base64.StdEncoding.EncodeToString(data)
}

func TestDecodeDepositLocked(t *testing.T) {
	escrow := fakePubkey(1)
	landlord := fakePubkey(2)
	tenant := fakePubkey(3)

	var body []byte
	body = append(body, escrow...)
	body = append(body, landlord...)
	body = append(body, tenant...)
	body = appendU64(body, 1_000_000)
	body = appendI64(body, 1700000000)

	logLine := buildLogLine(DiscriminatorDepositLocked, body)
	events := DecodeEvents([]string{"Program log: something", logLine}, "5xTxSig")

	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	evt := events[0]
	if evt.Topic != kafkapkg.TopicSolanaDepositLocked {
		t.Errorf("topic = %s, want %s", evt.Topic, kafkapkg.TopicSolanaDepositLocked)
	}

	payload := evt.Payload.(*SolanaDepositLockedEvent)
	if payload.Escrow != base58.Encode(escrow) {
		t.Errorf("escrow mismatch")
	}
	if payload.Landlord != base58.Encode(landlord) {
		t.Errorf("landlord mismatch")
	}
	if payload.Tenant != base58.Encode(tenant) {
		t.Errorf("tenant mismatch")
	}
	if payload.DepositAmount != 1_000_000 {
		t.Errorf("deposit_amount = %d, want 1000000", payload.DepositAmount)
	}
	if payload.Deadline != 1700000000 {
		t.Errorf("deadline = %d, want 1700000000", payload.Deadline)
	}
	if payload.TxSignature != "5xTxSig" {
		t.Errorf("tx_signature = %s, want 5xTxSig", payload.TxSignature)
	}
}

func TestDecodePartySigned(t *testing.T) {
	escrow := fakePubkey(1)
	signer := fakePubkey(2)

	var body []byte
	body = append(body, escrow...)
	body = append(body, signer...)
	body = appendString(body, "landlord")

	logLine := buildLogLine(DiscriminatorPartySigned, body)
	events := DecodeEvents([]string{logLine}, "sig123")

	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	payload := events[0].Payload.(*SolanaPartySignedEvent)
	if payload.Role != "landlord" {
		t.Errorf("role = %s, want landlord", payload.Role)
	}
	if payload.TxSignature != "sig123" {
		t.Errorf("tx_signature = %s, want sig123", payload.TxSignature)
	}
}

func TestDecodeEscrowExpired(t *testing.T) {
	escrow := fakePubkey(1)
	refundedTo := fakePubkey(2)

	var body []byte
	body = append(body, escrow...)
	body = append(body, refundedTo...)
	body = appendU64(body, 500_000)

	logLine := buildLogLine(DiscriminatorEscrowExpired, body)
	events := DecodeEvents([]string{logLine}, "sigABC")

	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	payload := events[0].Payload.(*SolanaEscrowExpiredEvent)
	if payload.Amount != 500_000 {
		t.Errorf("amount = %d, want 500000", payload.Amount)
	}
	if payload.RefundedTo != base58.Encode(refundedTo) {
		t.Errorf("refunded_to mismatch")
	}
}

func TestDecodeEventsIgnoresUnknown(t *testing.T) {
	unknown := [8]byte{0, 0, 0, 0, 0, 0, 0, 0}
	logLine := buildLogLine(unknown, []byte("some random data here!!"))
	events := DecodeEvents([]string{logLine}, "sig")

	if len(events) != 0 {
		t.Errorf("expected 0 events for unknown discriminator, got %d", len(events))
	}
}

func TestDecodeEventsMultipleInOneTx(t *testing.T) {
	escrow := fakePubkey(1)
	signer := fakePubkey(2)

	var signBody []byte
	signBody = append(signBody, escrow...)
	signBody = append(signBody, signer...)
	signBody = appendString(signBody, "tenant")

	var expiredBody []byte
	expiredBody = append(expiredBody, escrow...)
	expiredBody = append(expiredBody, fakePubkey(3)...)
	expiredBody = appendU64(expiredBody, 100)

	logs := []string{
		"Program log: Instruction: TenantSign",
		buildLogLine(DiscriminatorPartySigned, signBody),
		buildLogLine(DiscriminatorEscrowExpired, expiredBody),
	}

	events := DecodeEvents(logs, "multiSig")
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
}
