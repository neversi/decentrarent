# Solana Event Listener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Solana WebSocket log listener to the backend that parses 3 Anchor events and publishes them to Kafka.

**Architecture:** A goroutine subscribes to Solana program logs via `solana-go` WebSocket client, decodes Anchor events from base64 `Program data:` log lines using hardcoded discriminators + manual Borsh deserialization, and publishes typed payloads to 3 new Kafka topics via the existing `kafka.Producer`.

**Tech Stack:** `github.com/gagliardetto/solana-go` (WebSocket + types), `github.com/IBM/sarama` (existing Kafka), Go 1.25

---

### Task 1: Install `solana-go` Dependency

**Files:**
- Modify: `backend/go.mod`

- [ ] **Step 1: Add the dependency**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go get github.com/gagliardetto/solana-go@latest`

Expected: `go.mod` updated with `solana-go` and its transitive deps.

- [ ] **Step 2: Tidy**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go mod tidy`

Expected: Clean exit, no errors.

- [ ] **Step 3: Verify it resolves**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: Builds successfully (no code changes yet, just verifying dep resolution).

---

### Task 2: Add Kafka Topics and Config

**Files:**
- Modify: `backend/internal/kafka/kafka.go:14-24` (add topic constants)
- Modify: `backend/internal/kafka/kafka.go:26-37` (add to AllTopics)
- Modify: `backend/internal/config/config.go:8-21` (add fields)
- Modify: `backend/internal/config/config.go:24-37` (add to Load)

- [ ] **Step 1: Add 3 new Kafka topic constants**

In `backend/internal/kafka/kafka.go`, add after line 23 (`TopicRentPaid`):

```go
	// Solana on-chain event topics
	TopicSolanaDepositLocked = "solana.deposit.locked"
	TopicSolanaPartySigned   = "solana.party.signed"
	TopicSolanaEscrowExpired = "solana.escrow.expired"
```

- [ ] **Step 2: Include new topics in `AllTopics()`**

In `backend/internal/kafka/kafka.go`, add the 3 new topics to the `AllTopics()` return slice:

```go
func AllTopics() []string {
	return []string{
		TopicOrderCreated,
		TopicOrderSigned,
		TopicOrderActivated,
		TopicOrderExpired,
		TopicOrderSettled,
		TopicOrderDisputeOpened,
		TopicOrderDisputeResolved,
		TopicRentPaid,
		TopicSolanaDepositLocked,
		TopicSolanaPartySigned,
		TopicSolanaEscrowExpired,
	}
}
```

- [ ] **Step 3: Add Solana config fields**

In `backend/internal/config/config.go`, add to the `Config` struct:

```go
	SolanaWSURL     string
	SolanaProgramID string
```

- [ ] **Step 4: Load Solana config in `Load()`**

In `backend/internal/config/config.go`, add to the `Load()` return:

```go
		SolanaWSURL:     getEnv("SOLANA_WS_URL", "wss://api.devnet.solana.com"),
		SolanaProgramID: getEnv("SOLANA_PROGRAM_ID", "GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY"),
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: Builds successfully.

---

### Task 3: Create `events.go` — Event Types and Discriminators

**Files:**
- Create: `backend/internal/solana/events.go`

- [ ] **Step 1: Create `events.go`**

```go
package solana

import (
	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
)

// Anchor event discriminators from the IDL (first 8 bytes of SHA256("event:<EventName>")).
var (
	DiscriminatorDepositLocked   = [8]byte{32, 241, 131, 66, 63, 132, 192, 116}
	DiscriminatorPartySigned     = [8]byte{169, 92, 130, 193, 52, 197, 129, 22}
	DiscriminatorEscrowExpired   = [8]byte{189, 22, 170, 250, 75, 218, 58, 112}
)

// Kafka payloads — published as JSON to the corresponding topics.

type SolanaDepositLockedEvent struct {
	Escrow        string `json:"escrow"`
	Landlord      string `json:"landlord"`
	Tenant        string `json:"tenant"`
	DepositAmount uint64 `json:"deposit_amount"`
	Deadline      int64  `json:"deadline"`
	TxSignature   string `json:"tx_signature"`
}

type SolanaPartySignedEvent struct {
	Escrow      string `json:"escrow"`
	Signer      string `json:"signer"`
	Role        string `json:"role"`
	TxSignature string `json:"tx_signature"`
}

type SolanaEscrowExpiredEvent struct {
	Escrow     string `json:"escrow"`
	RefundedTo string `json:"refunded_to"`
	Amount     uint64 `json:"amount"`
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
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: Builds successfully.

---

### Task 4: Create `decoder.go` — Anchor Event Parser

**Files:**
- Create: `backend/internal/solana/decoder.go`

- [ ] **Step 1: Create `decoder.go`**

```go
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
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: Builds successfully.

---

### Task 5: Create `decoder_test.go` — Unit Tests for Decoder

**Files:**
- Create: `backend/internal/solana/decoder_test.go`

- [ ] **Step 1: Create `decoder_test.go`**

```go
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
	// A single tx can emit multiple events
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
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go test ./internal/solana/ -v`

Expected: All 5 tests pass.

---

### Task 6: Create `listener.go` — WebSocket Subscription

**Files:**
- Create: `backend/internal/solana/listener.go`

- [ ] **Step 1: Create `listener.go`**

```go
package solana

import (
	"context"
	"log"
	"time"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc/ws"

	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
)

const reconnectDelay = 5 * time.Second

type Listener struct {
	wsURL     string
	programID solanago.PublicKey
	producer  *kafkapkg.Producer
}

func NewListener(wsURL, programID string, producer *kafkapkg.Producer) *Listener {
	return &Listener{
		wsURL:     wsURL,
		programID: solanago.MustPublicKeyFromBase58(programID),
		producer:  producer,
	}
}

func (l *Listener) Start(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			log.Println("[solana] listener stopped: context cancelled")
			return
		}

		err := l.subscribe(ctx)
		if err != nil {
			log.Printf("[solana] subscription error: %v", err)
		}

		log.Printf("[solana] reconnecting in %s...", reconnectDelay)
		select {
		case <-ctx.Done():
			log.Println("[solana] listener stopped: context cancelled")
			return
		case <-time.After(reconnectDelay):
		}
	}
}

func (l *Listener) subscribe(ctx context.Context) error {
	client, err := ws.Connect(ctx, l.wsURL)
	if err != nil {
		return err
	}
	defer client.Close()

	log.Printf("[solana] connected to %s, subscribing to program %s", l.wsURL, l.programID)

	sub, err := client.LogsSubscribeMentions(l.programID, "confirmed")
	if err != nil {
		return err
	}
	defer sub.Unsubscribe()

	log.Println("[solana] subscription active, listening for events...")

	for {
		result, err := sub.Recv(ctx)
		if err != nil {
			return err
		}

		if result.Value.Err != nil {
			continue
		}

		txSig := result.Value.Signature.String()
		events := DecodeEvents(result.Value.Logs, txSig)

		for _, evt := range events {
			if err := l.producer.Publish(ctx, evt.Topic, evt.Key, evt.Payload); err != nil {
				log.Printf("[solana] failed to publish %s: %v", evt.Topic, err)
			}
		}
	}
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: Builds successfully.

---

### Task 7: Integrate Listener into `main.go`

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add import**

Add to the import block in `backend/cmd/server/main.go`:

```go
	solanapkg "github.com/abdro/decentrarent/backend/internal/solana"
```

- [ ] **Step 2: Start the listener goroutine**

In `backend/cmd/server/main.go`, add after the Kafka consumers block (after line 118) and before the Handlers section:

```go
	// ─── Solana event listener ──────────────────────────────────────
	if kafkaProducer != nil {
		solanaListener := solanapkg.NewListener(cfg.SolanaWSURL, cfg.SolanaProgramID, kafkaProducer)
		go solanaListener.Start(ctx)
		log.Println("Solana event listener started")
	}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go build ./...`

Expected: Builds successfully.

- [ ] **Step 4: Run all tests**

Run: `cd /Users/abdro/Desktop/DecentraRent/backend && go test ./... 2>&1`

Expected: All tests pass (including the decoder tests from Task 5).

---

### Task 8: Add Taskfile Commands

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add backend tasks to `Taskfile.yml`**

Add these tasks to the existing `Taskfile.yml`:

```yaml
  backend:test:
    desc: Run backend Go tests
    dir: backend
    cmd: go test ./... -v

  backend:build:
    desc: Build backend binary
    dir: backend
    cmd: go build ./cmd/server
```

- [ ] **Step 2: Verify tasks parse**

Run: `task --list`

Expected: `backend:test` and `backend:build` appear in the list.
