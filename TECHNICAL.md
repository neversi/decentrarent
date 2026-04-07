# DecentraRent — Technical Reference

## Architecture Overview

```
┌─────────────┐   Anchor TX    ┌──────────────────┐
│  Solana     │──────logs─────▶│  Solana Listener │ (WebSocket subscription to program)
│  Program    │                │  + Decoder       │
└─────────────┘                └────────┬─────────┘
                                        │ Kafka publish
                               ┌────────▼─────────┐
                               │     Kafka        │
                               │  solana.*topics  │
                               └────────┬─────────┘
                                        │ consume
                          ┌─────────────▼──────────────┐
                          │  Go Backend (Chi)           │
                          │  order consumers            │
                          │  chat consumers             │
                          └──────────┬──────────────────┘
                    HTTP API /api/*  │  HTTP publish /api
                          ┌──────────▼──────────────────┐
                          │        Centrifugo           │
                          │  property:* / orders:*      │
                          └──────────┬──────────────────┘
                                     │ WebSocket
                          ┌──────────▼──────────────────┐
                          │         Frontend            │
                          │  React + Anchor SDK         │
                          └─────────────────────────────┘
```

---

## Backend (`backend/`)

### Entry Point — `cmd/server/main.go`

Initialises all services, registers routes, starts Kafka consumers and Solana listener.

**Key service wiring:**
```go
kafkaProducer          = kafka.NewProducer(cfg.KafkaBrokers)
escrowService          = escrow.NewService(cfg.SolanaRPCURL, cfg.AuthorityPrivateKey)
orderCentrifugoAdapter = HTTP bridge → Centrifugo /api (method:"publish")
orderService           = order.NewService(orderStore, chatStore, kafkaProducer, centrifugoAdapter, escrowService)
chatService            = chat.NewService(chatStore, centrifugoClient)
```

### HTTP Routes

All routes under `/api`. JWT middleware on the `Protected` group (Bearer token).

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| GET | `/health` | — | public |
| GET | `/auth/nonce?wallet=` | `AuthHandler.GetNonce` | public |
| POST | `/auth/verify` | `AuthHandler.Verify` | public |
| POST | `/auth/login` | `AuthHandler.Login` | public |
| POST | `/auth/signup` | `AuthHandler.Signup` | public |
| POST | `/centrifugo/connect` | `CentrifugoHandler.Connect` | public (Centrifugo proxy) |
| POST | `/centrifugo/subscribe` | `CentrifugoHandler.Subscribe` | public (Centrifugo proxy) |
| POST | `/centrifugo/publish` | `CentrifugoHandler.Publish` | public (Centrifugo proxy) |
| GET | `/properties` | `PropertyHandler.List` | public |
| GET | `/properties/{id}` | `PropertyHandler.Get` | public |
| POST | `/auth/refresh` | `AuthHandler.Refresh` | protected |
| GET | `/user/me` | `UserHandler.GetMe` | protected |
| PUT | `/user/me` | `UserHandler.UpdateProfile` | protected |
| GET | `/users/{id}` | `UserHandler.GetPublicProfile` | protected |
| GET/POST/DELETE | `/conversations` | `ChatHandler.*` | protected |
| GET | `/conversations/{id}/messages` | `ChatHandler.GetMessages` | protected |
| POST | `/conversations/documents` | `ChatHandler.SendDocument` | protected |
| POST | `/properties` | `PropertyHandler.Create` | protected |
| PUT/PATCH/DELETE | `/properties/{id}` | `PropertyHandler.*` | protected |
| POST | `/properties/{id}/media/*` | `MediaHandler.*` | protected |
| POST | `/orders` | `OrderHandler.Create` | protected |
| GET | `/orders` | `OrderHandler.List` | protected |
| GET | `/orders/{id}` | `OrderHandler.Get` | protected |
| POST | `/orders/{id}/accept` | `OrderHandler.Accept` | protected |
| POST | `/orders/{id}/reject` | `OrderHandler.Reject` | protected |
| POST | `/orders/{id}/dispute` | `OrderHandler.OpenDispute` | protected |
| GET | `/orders/{id}/payments` | `OrderHandler.GetPayments` | protected |
| GET | `/orders/{id}/history` | `OrderHandler.GetHistory` | protected |
| POST | `/escrow/release-to-tenant` | `EscrowHandler.ReleaseToTenant` | public |
| POST | `/escrow/release-to-landlord` | `EscrowHandler.ReleaseToLandlord` | public |
| POST | `/escrow/dispute` | `EscrowHandler.OpenDispute` | public |
| POST | `/escrow/dispute/resolve-tenant` | `EscrowHandler.ResolveDisputeTenant` | public |
| POST | `/escrow/dispute/resolve-landlord` | `EscrowHandler.ResolveDisputeLandlord` | public |
| POST | `/escrow/expire` | `EscrowHandler.ExpireEscrow` | public |

### Order Domain

**`internal/order/service.go`**

Order status lifecycle:
```
New → AwaitingDeposit → AwaitingSignatures → Active → Settled
                                                    ↘ Disputed → DisputeResolvedTenant / DisputeResolvedLandlord
                                           ↘ Expired
                      ↘ Rejected
```

`Service` methods:

| Method | Kafka publish | Centrifugo publish |
|--------|--------------|-------------------|
| `CreateOrder` | `order.created` | `orders:{conversationID}` type=`order_created` |
| `AcceptOrder` | `order.signed` (+ `order.activated` if both) | type=`order_accepted` / `order_both_accepted` |
| `RejectOrder` | `order.rejected` (implicit) | type=`order_rejected` |
| `OpenDispute` | — | calls `escrowSvc.OpenDispute()` on-chain |

**`internal/order/consumers.go`** — consumer group `order-solana-consumer`

| Kafka topic | Handler | DB effect + follow-on |
|------------|---------|----------------------|
| `solana.deposit.locked` | `handleDepositLocked` | status→AwaitingSignatures, saves escrow addr, inserts `expire_escrow` job at SignDeadline |
| `solana.party.signed` | `handlePartySigned` | sets tenant/landlord `signed_onchain`; when both → Active, inserts `release_deposit` job at RentEndDate, inserts recurring `pay_due` jobs per property period |
| `solana.escrow.expired` | `handleEscrowExpired` | status→Expired |
| `solana.rent.paid` | `handleRentPaid` | inserts `RentPayment` record, sends system chat message |
| `solana.dispute.opened` | `handleDisputeOpened` | status→Disputed, sends system chat message |

Rent period → seconds: `"hour"`→3600, `"day"`→86400, `"week"`→604800, `"month"`→2592000

### Chat Domain

**`internal/chat/model.go`**

```go
// Channel namespaces
SubscriptionChannelProperty = "property"   // format: property:{propertyID}:chat:{loanerID}
SubscriptionChannelOrder    = "orders"     // format: orders:{conversationID}

// Message types
MessageTypeText     = "text"
MessageTypeSystem   = "system"
MessageTypeDocument = "document"
MessageTypeModal    = "modal"

// Modal actions
ModalActionCreateAgreement = "create_agreement"
ModalActionSignAgreement   = "sign_agreement"
ModalActionDepositConfirm  = "deposit_confirm"

// Modal statuses
ModalStatusPending / Accepted / Rejected / Expired
```

`Message.Metadata` (`MessageMeta`):
```go
DocumentURL, DocumentName, OrderID string
ModalAction, ModalStatus, ModalID  string
EventType, Tx                      string
```

**`internal/chat/service.go`**

Key methods:
- `ParseChannelProperty(channel) → (propertyID, loanerID)`
- `ParseChannelOrder(channel) → conversationID`
- `CanSubscribe(channel, userID) → error` — validates DB membership
- `SaveMessage(channel, senderID, content) → *Message`
- `SendSystemMessage(convID, content, eventType) → *Message` — persists + publishes to Centrifugo
- `SendSystemMessageWithTx(convID, content, eventType, tx) → *Message`
- `SendModalMessage(convID, content, modalAction, orderID) → *Message`
- `RespondToModal(messageID, status) → error`
- `FindConversationForOrder(propertyID, landlordWallet, tenantWallet) → *Conversation`

**`internal/chat/consumers.go`** — consumer group `chat-service`

| Kafka topic | Chat action |
|------------|-------------|
| `order.created` | modal: `create_agreement` — "Order was initiated. Deposit: …, Rent: …" |
| `order.signed` | system: "{role} signed the contract" |
| `order.activated` | system: "Order is signed by both sides." + modal: `deposit_confirm` |
| `order.expired` | system: "Order expired. Agreement cancelled." |
| `order.settled` | system: "Order settled. Deposit refunded." + document msg |
| `order.dispute.opened` | system: "Dispute opened. Reason: …" |
| `order.dispute.resolved` | system: "Dispute resolved in favor of {tenant/landlord}." |

### Kafka — `internal/kafka/kafka.go`

**Topics:**
```
order.created          order.signed           order.activated
order.expired          order.settled
order.dispute.opened   order.dispute.resolved
order.rent.paid

solana.deposit.locked  solana.party.signed    solana.escrow.expired
solana.rent.paid       solana.dispute.opened
```

**Producer:**
```go
func (p *Producer) Publish(ctx context.Context, topic, key string, payload interface{}) error
// Sarama SyncProducer; payload JSON-encoded
```

**ConsumerGroup:**
```go
func NewConsumerGroup(brokers []string, groupID string, handlers map[string]MessageHandler)
// handler: func(topic string, value []byte) error
// strategy: round-robin, offset newest
```

**Event types:**

| Struct | Fields |
|--------|--------|
| `OrderEvent` | event_id, order_id, property_id, tenant_wallet, landlord_wallet, deposit_amount, token_mint, rent_amount, escrow_status, timestamp |
| `OrderSignedEvent` | + signed_by, role, both_signed |
| `OrderDisputeEvent` | + opened_by, reason |
| `DisputeResolvedEvent` | + winner, reason |
| `RentPaidEvent` | + paid_by, amount, tx_hash, period_start, period_end |
| `SolanaDepositLockedEvent` | escrow, landlord, tenant, deposit_amount, deadline, order_id[16], tx_signature |
| `SolanaPartySignedEvent` | escrow, signer, role, tx_signature |
| `SolanaEscrowExpiredEvent` | escrow, refunded_to, amount, tx_signature |
| `SolanaRentPaidEvent` | escrow, tenant, landlord, amount, total_paid, paid_at, tx_signature |
| `SolanaDisputeOpenedEvent` | escrow, reason, tx_signature |

### Solana Client — `internal/solana/`

**`events.go`** — discriminator → Kafka topic mapping

```go
DiscriminatorDepositLocked = [8]byte{32, 241, 131, 66, 63, 132, 192, 116}
DiscriminatorPartySigned   = [8]byte{169, 92, 130, 193, 52, 197, 129, 22}
DiscriminatorEscrowExpired = [8]byte{189, 22, 170, 250, 75, 218, 58, 112}
DiscriminatorRentPaid      = [8]byte{140, 29, 172, 69, 152, 38, 73, 241}
DiscriminatorDisputeOpened = [8]byte{254, 194, 187, 184, 52, 42, 140, 209}
```

**`decoder.go`**

```go
func DecodeEvents(logs []string, txSignature string) []DecodedEvent
```

Algorithm:
1. Scan log lines for `"Program data: "` prefix
2. Base64-decode remainder
3. First 8 bytes → discriminator lookup → topic + decoder fn
4. Remaining bytes → Borsh-decode using:
   - `readPubkey(data, offset)` — 32 bytes → base58
   - `readU64 / readI64` — 8 bytes LE
   - `readString` — 4-byte LE length prefix + UTF-8
   - `readBytes(n)`
5. Returns `[]DecodedEvent{Topic, Key (escrow pubkey), Payload}`

---

## Centrifugo

Config: `centrifugo/config.json`

**Connection:**
- WebSocket: `ws://<host>:8000/connection/websocket`
- HTTP API: `http://<host>:8000/api` (key: `api-secret`)
- Client token: HMAC-SHA256 with `decentrarent-dev-jwt-secret-change-in-production`
- Allowed origins: `http://localhost:5173`

**Namespaces:**

| Namespace | Channels | History | Publish proxy | Subscribe proxy | Recovery |
|-----------|----------|---------|--------------|----------------|----------|
| `property` | `property:{propertyID}:chat:{loanerID}` | size=50, ttl=720h | ✓ | ✓ | ✓ |
| `orders` | `orders:{conversationID}` | — | ✓ | ✓ | — |

**Proxy hooks** (Centrifugo → Backend):

| Hook | Endpoint | Purpose |
|------|----------|---------|
| connect | `POST /centrifugo/connect` | Issue Centrifugo user token from JWT |
| subscribe | `POST /centrifugo/subscribe` | Verify user has access to channel (DB lookup) |
| publish | `POST /centrifugo/publish` | Persist message to DB before delivery |

**Backend → Centrifugo publish** (via `orderCentrifugoAdapter`):
```
POST http://centrifugo:8000/api
{"method":"publish","params":{"channel":"orders:{conversationID}","data":{...}}}
```

Centrifugo event envelope on `orders:*`:
```json
{
  "type": "order_created|order_accepted|order_both_accepted|order_rejected|deposit_locked|party_signed|order_activated|rent_paid|dispute_opened|order_expired",
  "order_id": "...",
  "status": "...",
  "order": { ... },
  "tx": "..."
}
```

---

## Blockchain — Anchor Program (`blockchain/lease/`)

**Program IDs:**
- Devnet: `GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY`
- Localnet: `6pbgJgKEzw4XigAzvfoR4zEts3arXCyYuF4J5pzgnzuh`

### Escrow Account

```rust
pub struct Escrow {
    pub order_id: [u8; 16],       // UUID bytes
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub authority: Pubkey,
    pub deposit_amount: u64,
    pub price_rent: u64,
    pub total_rent_paid: u64,
    pub status: EscrowStatus,
    pub deadline: i64,            // Unix timestamp — signing deadline
    pub start_date: i64,
    pub end_date: i64,
    pub period: i64,              // rent period in seconds
    pub landlord_signed: bool,
    pub tenant_signed: bool,
    pub bump: u8,
}
```

**PDA seeds:** `["escrow", landlord_pubkey, tenant_pubkey, order_id[16]]`

### EscrowStatus Enum

```rust
AwaitingSignatures | Active | Settled |
Disputed | DisputeResolvedTenant | DisputeResolvedLandlord | Expired
```

### Instructions

| Instruction | Signer | Pre-conditions | State transition | Emits |
|-------------|--------|---------------|-----------------|-------|
| `lock_deposit` | tenant | deadline > now, end > start, (end-start) % period == 0 | — → AwaitingSignatures; transfers deposit tenant→escrow | `DepositLocked` |
| `landlord_sign` | landlord | AwaitingSignatures, deadline not passed | landlord_signed=true; if both → Active | `PartySignedEvent` |
| `tenant_sign` | tenant | AwaitingSignatures, deadline not passed | tenant_signed=true; if both → Active | `PartySignedEvent` |
| `pay_rent` | tenant | Active, amount==price_rent, total+amount ≤ price_rent×periods | total_rent_paid += amount; transfers tenant→landlord | `RentPaid` |
| `release_deposit_to_tenant` | authority | Active | Settled; transfers deposit escrow→tenant | `DepositReleased` reason=`normal_end` |
| `open_dispute` | authority | Active, reason ≤ 200 chars | Disputed | `DisputeOpened` |
| `resolve_dispute_tenant` | authority | Disputed | DisputeResolvedTenant; transfers deposit→tenant | `DepositReleased` |
| `resolve_dispute_landlord` | authority | Disputed | DisputeResolvedLandlord; transfers deposit→landlord | `DepositReleased` |
| `expire_escrow` | authority | AwaitingSignatures, now > deadline | Expired; transfers deposit→tenant | `EscrowExpired` |

### Events (emitted in program logs, base64 Borsh-encoded)

| Event | Fields |
|-------|--------|
| `DepositLocked` | escrow, landlord, tenant, deposit_amount: u64, deadline: i64, order_id: [u8;16] |
| `PartySignedEvent` | escrow, signer, role: String |
| `DocumentSigned` | escrow, order_id |
| `RentPaid` | escrow, tenant, landlord, amount: u64, total_paid: u64, paid_at: i64 |
| `DepositReleased` | escrow, recipient, amount: u64, reason: String |
| `DisputeOpened` | escrow, reason: String |
| `EscrowExpired` | escrow, refunded_to, amount: u64 |

---

## Frontend Communication

### API Client — `lib/api.ts`

```ts
apiFetch<T>(path: string, options?: RequestInit, token?: string): Promise<T>
// Base: /api  (Vite proxies /api/* → http://backend:8080)
// Headers: Content-Type: application/json, Authorization: Bearer {token}
// 204 → undefined; otherwise JSON parse
// Non-2xx → throws Error(responseBody.message)
```

### Wallet Auth — `features/auth/hooks/useWalletAuth.ts`

```ts
useWalletAuth() → { signIn, signOut, isLoading, error, isAuthenticated }

type WalletAuthResult = 'success' | 'wallet_not_registered'
```

Sign-in flow:
```
GET /auth/nonce?wallet={base58}  →  { nonce, message }
wallet.signMessage(encode(message))  →  signatureBytes
bs58.encode(signatureBytes)  →  signatureBase58
POST /auth/verify { wallet, signature, nonce }  →  { token, user }
authStore.login(token, user)
```

### Centrifugo Client — `lib/centrifugo.ts`

```ts
getCentrifugoClient(token: string): Centrifuge
// URL: ws://localhost:8000/connection/websocket
// Singleton; auto-connects

disconnectCentrifugo(): void
```

Subscription pattern (frontend):
```ts
const client = getCentrifugoClient(jwtToken);
const sub = client.newSubscription(`orders:${conversationID}`);
sub.on('publication', ({ data }) => { /* handle event envelope */ });
sub.subscribe();
```

### Anchor / Escrow — `features/escrow/`

**PDA derivation (`pda.ts`):**
```ts
function uuidToBytes(uuid: string): Uint8Array  // strips hyphens, parses hex→16 bytes

function getEscrowPDA(
  landlord: PublicKey,
  tenant: PublicKey,
  orderId: string        // UUID string
): [PublicKey, number]  // [pda, bump]

// Seeds: ['escrow', landlord.toBytes(), tenant.toBytes(), uuidToBytes(orderId)]
// Program ID: GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY
```

**Program instance (`program.ts`):**
```ts
function getProgram(connection: Connection, wallet: AnchorWallet): Program
// AnchorProvider commitment: "confirmed"
// IDL loaded from /idl/lease.json
```

Calling an instruction (example pattern):
```ts
const program = getProgram(connection, wallet);
const [escrowPDA] = getEscrowPDA(landlordPK, tenantPK, orderId);
await program.methods
  .lockDeposit(orderIdBytes, depositAmountBN, rentPriceBN, deadlineBN, startBN, endBN, periodBN)
  .accounts({ escrow: escrowPDA, tenant: wallet.publicKey, landlord: landlordPK, ... })
  .rpc();
```
