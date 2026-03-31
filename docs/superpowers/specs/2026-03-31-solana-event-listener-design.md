# Solana Event Listener Design

**Date:** 2026-03-31
**Status:** Draft
**Scope:** Go service (integrated into backend) that subscribes to Solana program logs via WebSocket and produces parsed Anchor events to Kafka.

---

## Overview

Add a Solana WebSocket log listener to the existing backend. It subscribes to program logs from the lease escrow contract on devnet, parses Anchor events from the log output, and publishes typed payloads to 3 new Kafka topics. The listener runs as a goroutine alongside the HTTP server, following the same pattern as the existing Kafka chat consumers.

## Constraints

- **Integrated into existing backend** — not a standalone service. Runs as a goroutine started from `main.go`.
- **Write-only to Kafka** — does not update order state directly. A separate consumer handles that.
- **3 events only:** `DepositLocked`, `PartySignedEvent`, `EscrowExpired`.
- **Uses `solana-go`** (`github.com/gagliardetto/solana-go`) for WebSocket subscription.
- **Reconnects on disconnect** — 5-second backoff, respects context cancellation.

## Architecture

```
Solana Devnet (WSS)
    ↓ logsSubscribe (program mentions)
solana.Listener (goroutine)
    ↓ log messages per tx
solana.Decoder
    ↓ base64 decode → discriminator match → Borsh deserialize
kafka.Producer.Publish(topic, event)
    ↓
Kafka broker
```

## File Structure

```
backend/internal/solana/
├── listener.go     # WebSocket subscription, reconnect loop, dispatch
├── decoder.go      # Anchor event parsing: base64 → discriminator → struct
└── events.go       # Event structs, discriminator constants, topic mapping
```

Modified files:
- `backend/internal/config/config.go` — add `SolanaWSURL`, `SolanaProgramID`
- `backend/internal/kafka/kafka.go` — add 3 new topic constants, include in `AllTopics()`
- `backend/cmd/server/main.go` — start listener goroutine

## Kafka Topics & Event Types

### New Topics

| Topic | Solana Event | Key |
|---|---|---|
| `solana.deposit.locked` | `DepositLocked` | escrow address |
| `solana.party.signed` | `PartySignedEvent` | escrow address |
| `solana.escrow.expired` | `EscrowExpired` | escrow address |

### Go Payload Types (`events.go`)

```go
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
    Escrow      string `json:"escrow"`
    RefundedTo  string `json:"refunded_to"`
    Amount      uint64 `json:"amount"`
    TxSignature string `json:"tx_signature"`
}
```

All pubkeys are base58-encoded strings. `TxSignature` is the transaction signature from the WebSocket log notification.

## Module Details

### `events.go` — Event Definitions

Contains:
- The 3 payload structs above
- Precomputed Anchor event discriminators (first 8 bytes of `SHA256("event:<EventName>")`)
- Topic constants for the 3 new topics
- A mapping from discriminator → topic + decoder function

Discriminators:
- `DepositLocked` → `SHA256("event:DepositLocked")[:8]`
- `PartySignedEvent` → `SHA256("event:PartySignedEvent")[:8]`
- `EscrowExpired` → `SHA256("event:EscrowExpired")[:8]`

### `decoder.go` — Anchor Event Parser

Exports `DecodeEvent(logMessages []string, txSignature string) []DecodedEvent` where `DecodedEvent` contains the topic, key (escrow address), and typed payload.

Parsing logic:
1. Scan log messages for lines matching `"Program data: <base64>"`
2. Base64-decode the data
3. Read first 8 bytes as the discriminator
4. Match against known discriminators
5. Borsh-deserialize the remaining bytes:
   - `Pubkey` → 32 bytes → base58 string
   - `u64` → 8 bytes little-endian
   - `i64` → 8 bytes little-endian
   - `String` → 4-byte length prefix + UTF-8 bytes
6. Attach `TxSignature` from the log notification
7. Return list of decoded events (a single tx can emit multiple events)

Borsh deserialization is done manually (sequential field reads) — no external Borsh library needed for these simple flat structs.

### `listener.go` — WebSocket Subscription

```go
type Listener struct {
    wsURL     string
    programID solana.PublicKey
    producer  *kafka.Producer
}

func NewListener(wsURL, programID string, producer *kafka.Producer) *Listener

func (l *Listener) Start(ctx context.Context)
```

`Start` runs an infinite loop:
1. Connect to Solana WebSocket via `solana-go`'s `ws.Connect(ctx, wsURL)`
2. Subscribe with `LogsSubscribe` filtering by program ID mention
3. For each log notification:
   - Extract log messages and transaction signature
   - Call `DecodeEvent(logMessages, txSignature)`
   - For each decoded event, `producer.Publish(ctx, event.Topic, event.Key, event.Payload)`
4. On connection error or subscription drop:
   - Log the error
   - Wait 5 seconds (respecting ctx cancellation)
   - Loop back to step 1

Graceful shutdown: when `ctx` is cancelled, the WebSocket connection closes and the goroutine exits.

## Config Additions

New fields in `config.Config`:

```go
SolanaWSURL    string  // env: SOLANA_WS_URL, default: "wss://api.devnet.solana.com"
SolanaProgramID string // env: SOLANA_PROGRAM_ID, default: "GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY"
```

## main.go Integration

Same pattern as chat consumers:

```go
// ─── Solana event listener ──────────────────────────────────────
solanaListener := solana.NewListener(cfg.SolanaWSURL, cfg.SolanaProgramID, kafkaProducer)
go solanaListener.Start(ctx)
```

Placed after Kafka producer creation, before HTTP server start. The context from `signal.NotifyContext` ensures the listener stops on SIGINT/SIGTERM.

## Dependencies

New Go dependency:
- `github.com/gagliardetto/solana-go` — Solana WebSocket client, PublicKey type, base58 encoding

No other new dependencies. Borsh deserialization is manual.
