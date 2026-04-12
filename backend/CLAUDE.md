# CLAUDE.md — Backend

This file provides guidance to Claude Code (claude.ai/code) when working inside `backend/`.
For project-wide context see the top-level [CLAUDE.md](../CLAUDE.md).

## Purpose

The Go backend is the authoritative server for DecentraRent. It:

- Exposes the HTTP/JSON API to the React frontend (Chi router, JWT-authenticated).
- Bridges Solana ↔ Postgres via a Kafka event bus (Solana listener → consumers → DB → Centrifugo).
- Acts as the Anchor program's **authority** signer for admin-only instructions (expire, dispute resolution, deposit release).
- Proxies Centrifugo connect/subscribe/publish hooks so messages are persisted before broadcast.
- Drives two background workers that claim scheduled jobs from Postgres.

## Commands

Run from repo root via [Task](https://taskfile.dev/):

```
task backend:build                 # go build ./cmd/server
task backend:test                  # go test ./... -v
task backend:docs                  # Regenerate Swagger (swag init) — see backend/docs/
task backend:migrate:up            # Apply pending migrations
task backend:migrate:down          # Rollback 1 migration (STEPS=N for more)
task backend:migrate:create NAME=x # New migration pair
task backend:migrate:version
task backend:migrate:force VERSION=N
```

Inside Docker the container runs `air -c .air.toml` (hot reload, rebuilds to `tmp/main`). Startup auto-applies all migrations via [internal/dbmigrate](internal/dbmigrate/migrate.go) before the server accepts traffic.

Swagger UI: `http://localhost:8080/swagger/index.html`.

## Layout

```
backend/
├── cmd/server/main.go        # Entry point: wiring, routes, goroutines
├── docs/                     # Swagger output (generated; do not edit by hand)
├── migrations/               # golang-migrate SQL pairs (NNNNNN_*.up.sql / .down.sql)
└── internal/
    ├── auth/                 # JWT + Solana wallet (ed25519) signature verification, middleware
    ├── chat/                 # Conversations, messages, Centrifugo proxy hooks + client
    ├── config/               # Env var loading
    ├── dbmigrate/            # Migrator wrapper (runs on boot)
    ├── egov/                 # Government property verification (mock stub)
    ├── escrow/               # Anchor authority signer + HTTP handlers
    ├── kafka/                # Sarama producer/consumer group + topic constants + event structs
    ├── media/                # MinIO presigned URLs, property/chat media metadata
    ├── middleware/           # Context-key constants + getters
    ├── order/                # Order lifecycle, Solana event consumers, scheduled jobs
    ├── price/                # SOL→USDT price cache (CoinGecko)
    ├── property/             # Listings CRUD w/ eGov verification
    ├── solana/               # Log-subscription listener + Anchor event decoder
    ├── user/                 # User CRUD, credentials storage
    ├── utils/                # Misc token helpers
    └── worker/               # Escrow + paydue pollers
```

## Domain Pattern

Each domain package follows **Handler → Service → Store**:

- **Store** — `*sql.DB` queries. Returns domain structs; no HTTP awareness.
- **Service** — business rules, Kafka publishes, Centrifugo fan-out, cross-domain orchestration.
- **Handler** — request decoding, auth extraction via `middleware.Get*`, JSON responses, Swagger annotations.

Wiring lives entirely in [cmd/server/main.go](cmd/server/main.go). Do not introduce a DI framework; keep the constructor chain explicit.

## HTTP Routing

Routes are declared top-to-bottom in [main.go](cmd/server/main.go). Three scopes:

1. **Public** — `/auth/nonce`, `/auth/verify`, `/auth/login`, `/auth/signup`, `/centrifugo/*`, `/sol-price`, `GET /properties`, `GET /properties/{id}`, `/health`, `/swagger/*`.
2. **Protected** — wrapped in `r.Group` with `authService.AuthMiddleware`: everything user/chat/property/media/order-related. Admin-only actions live under `/admin/*` but use the same `IsAdmin` claim rather than a separate middleware — extend [auth/middleware.go](internal/auth/middleware.go) if that changes.
3. **Escrow HTTP** — `/escrow/*` endpoints are registered **outside the protected group**. They trigger authority-signed on-chain transactions; treat them as admin/internal surface and do not expose publicly without adding auth.

## Authentication

Two strategies, both issuing the same JWT:

1. **Wallet-first** — `GET /auth/nonce?wallet=` returns a 32-byte hex nonce (5 min TTL, in-memory). Client signs `"Sign this message to authenticate with DecentraRent: <nonce>"` with ed25519, then `POST /auth/verify` with `{wallet, signature, nonce}`. Backend decodes base58, verifies via `ed25519.Verify`, consumes the nonce, and issues JWT. If the wallet isn't registered, returns 404 `wallet_not_registered` so the frontend can redirect to signup.
2. **Credentials** — `/auth/signup` / `/auth/login` with bcrypt-hashed passwords.

JWT claims ([auth/service.go](internal/auth/service.go)):

```
UserID, WalletAddress, IsAdmin + RegisteredClaims (24h expiry, HS256)
```

`AuthMiddleware` stores `UserID`, `WalletAddress`, `IsAdmin` in context under keys from [internal/middleware/context.go](internal/middleware/context.go). Always read them via `mw.GetUserID(ctx)` / `mw.GetWalletAddress(ctx)` / `mw.GetIsAdmin(ctx)` / `mw.GetIdentifier(ctx)` — never reach for the context key directly.

Nonces are a `sync.RWMutex`-guarded in-memory map with a background cleanup goroutine. They **do not survive restart** and are not shared across replicas.

## Event Flow

```
Solana program emits Anchor event
  → [solana.Listener] WebSocket LogsSubscribeMentions (confirmed commitment)
  → [solana.DecodeEvents] scans "Program data:" lines, matches discriminator → topic
  → [kafka.Producer] publishes to solana.* topic keyed by escrow address
  → [order.OrderConsumers] consumer group "order-solana-consumer"
  → updates Postgres via order.Store, inserts follow-up jobs via order.JobStore
  → publishes domain event to order.* topic and fans out via Centrifugo channel orders:<conversationID>
  → frontend's Centrifugo subscription updates Zustand store
```

Consumer group defaults: round-robin rebalance, `OffsetNewest` — consumers do NOT replay historical messages on restart. `kafka.EnsureTopics` creates any missing topic with 3 partitions / replication factor 1 on boot.

## Kafka Topics ([internal/kafka/kafka.go](internal/kafka/kafka.go))

**Domain events** (produced by `order.Service`, informational — no one consumes all of them yet):
`order.created`, `order.signed`, `order.activated`, `order.expired`, `order.settled`, `order.dispute.opened`, `order.dispute.resolved`, `order.rent.paid`

**On-chain events** (produced by `solana.Listener`, consumed by `order.OrderConsumers`):
`solana.deposit.locked`, `solana.party.signed`, `solana.escrow.expired`, `solana.rent.paid`, `solana.dispute.opened`, `solana.dispute.released`

When adding a new Solana event:

1. Add a Borsh discriminator in [internal/solana/events.go](internal/solana/events.go).
2. Add a decoder in [internal/solana/decoder.go](internal/solana/decoder.go).
3. Add the topic constant and payload struct in [internal/kafka/kafka.go](internal/kafka/kafka.go) (include it in `AllTopics()` so `EnsureTopics` creates it).
4. Register a handler on `OrderConsumers` in [internal/order/consumers.go](internal/order/consumers.go).

## Order State Machine ([internal/order/model.go](internal/order/model.go))

```
new ──► rejected
  └──► awaiting_deposit ──► awaiting_signatures ──► active ──► settled
                                    │                    └──► disputed ──► dispute_resolved_tenant | dispute_resolved_landlord
                                    └──► expired
```

Transitions are declared in `AllowedTransitions`. Off-chain acceptance (both sides) moves `new → awaiting_deposit`. The chain-side deposit event moves `awaiting_deposit → awaiting_signatures`; both party-signed events move it to `active`. Expire/dispute/release are authority-signed.

Every transition writes a row to `order_status_history` via `Store.UpdateStatus`. When writing new code that changes status, go through `UpdateStatus` — do not update the column directly.

## Solana / Anchor Integration

- **Authority keypair** — `Config.AuthorityPrivateKey` is a base58 secret key loaded into `escrow.Service`. It pays fees and signs admin-only instructions. A default dev key is baked into [config.go](internal/config/config.go); override `AUTHORITY_PRIVATE_KEY` in any non-local environment.
- **PDA derivation** — `escrow.Service.FindEscrowPDA` uses seeds `['escrow', landlord.Bytes(), tenant.Bytes(), orderID[16]]`. Order IDs are `uuid.UUID` bytes cast to `[16]byte`.
- **Instruction discriminators** are hardcoded in [escrow/service.go](internal/escrow/service.go). If the Anchor program's instruction names change, these bytes will silently desync — regenerate from the IDL.
- **Anchor custom errors 6000–6012** are mapped to human-readable strings via `parseAnchorError`. Extend the map when new program errors are added.
- **Program ID** is defined in two places: `escrow.ProgramID` constant and `Config.SolanaProgramID` env var (defaults match the devnet ID). Keep them in sync when redeploying.
- **Transactions** are built in `sendAndConfirm`: fetch latest blockhash (confirmed), sign with authority, submit with preflight. Errors are re-wrapped through `parseAnchorError` so callers see the readable message.

## Centrifugo Integration

Two call paths:

1. **Proxy hooks** ([chat/centrifugo_hooks.go](internal/chat/centrifugo_hooks.go)) — `/centrifugo/connect` validates the JWT and returns `user: <wallet>`; `/centrifugo/subscribe` enforces channel ACLs via `chat.Service.CanSubscribe`; `/centrifugo/publish` **persists the message to Postgres first**, then returns the saved row so Centrifugo delivers the canonical DB representation. Do not bypass the publish hook.
2. **Server-initiated publish** — `chat.CentrifugoClient.PublishToConversation` and the ad-hoc `orderCentrifugoAdapter` (inline in [main.go](cmd/server/main.go)) hit Centrifugo's HTTP API directly with the `apikey ...` header. Both are used by the order consumers and worker system messages.

Channel conventions:

| Channel | Format | Used for |
|---------|--------|----------|
| `property:<property_id>:chat:<loaner_id>` | chat between a tenant and the owner | user messages |
| `orders:<conversation_id>` | one-to-one per conversation | order status updates |

`ParseChannelProperty` / `ParseChannelOrder` / `ParseChannelType` are the sole parsers; use them instead of hand-splitting strings.

## Background Workers ([internal/worker](internal/worker/))

Both workers poll Postgres job tables with `FOR UPDATE SKIP LOCKED` so multiple replicas can run safely.

- **`EscrowWorker`** — two ticker loops:
  - `release_deposit` jobs every **30s** — when rent ends, signs `release_deposit_to_tenant`.
  - `expire_escrow` jobs every **60s** — when the sign deadline passes without both signatures, signs `expire_escrow`.
  - Failed attempts go back to `init` up to `maxEscrowJobAttempts = 3`, then terminal `failed`.
- **`PaydueWorker`** — every **1 hour**, computes `totalOwed = periods × rentAmount - totalPaid` per active order and sends a system chat notification if the tenant is behind. Advances `trigger_at` by the property's `periodicity` (`hour|day|week|month`) or completes the job if past `rent_end_date`.

Jobs are inserted by `OrderConsumers.handlePartySigned` / `handleDepositLocked` and by the paydue bootstrap inside `handlePartySigned` once both parties sign on-chain.

## Media / MinIO ([internal/media/s3.go](internal/media/s3.go))

`S3Client` holds **two** underlying clients:

- `client` — internal endpoint (`MINIO_ENDPOINT`, reachable from inside Docker) used for bucket existence/creation, deletes.
- `signClient` — public endpoint (`MINIO_PUBLIC_ENDPOINT`) used for presigned URL generation so signatures are valid from the browser.

Key conventions:

- Property uploads: `properties/{propertyID}/{uuid}{ext}` — presigned PUT URL, 15 min TTL.
- Chat uploads: `chat/{conversationID}/{uuid}{ext}` — same TTL.
- Downloads: presigned GET, 1 hour TTL.

Bucket is auto-created on startup. Region is hardcoded to `us-east-1` on the signing client to skip a discovery round-trip.

## Migrations

golang-migrate, file-source. Numeric prefix = next sequence number. **The server runs `dbmigrate.Up` on every boot**, so shipping a broken `up.sql` will prevent startup — test locally first with `task backend:migrate:up` before bringing up the stack.

Always create pairs: `NNNNNN_name.up.sql` and `NNNNNN_name.down.sql`. If a dirty state blocks startup, fix the offending SQL, then `task backend:migrate:force VERSION=N` to the last known-good version and redeploy.

## Configuration ([internal/config/config.go](internal/config/config.go))

All config loads via environment variables with dev-friendly defaults. Notable:

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | local Postgres | sslmode=disable in dev |
| `JWT_SECRET` | dev placeholder | **rotate for prod** |
| `CENTRIFUGO_API_KEY` | `api-secret` | matches `centrifugo/config.json` |
| `KAFKA_BROKERS` | `localhost:9092` | comma-separated |
| `SOLANA_WS_URL` / `SOLANA_RPC_URL` | devnet | |
| `SOLANA_PROGRAM_ID` | devnet ID | **must equal** `escrow.ProgramID` |
| `AUTHORITY_PRIVATE_KEY` | dev key | base58 secret; **never use default in prod** |
| `MINIO_ENDPOINT` / `MINIO_PUBLIC_ENDPOINT` | `localhost:9000` | distinguish internal vs browser-facing |

## Conventions

- **Logging** — stdlib `log` with `[package]` prefixes. Do not add a logging framework for one-off messages.
- **Errors** — exported sentinel errors per domain (e.g. `order.ErrOrderNotFound`). Handlers map them to HTTP codes explicitly; do not bubble raw error strings to clients for auth-sensitive flows.
- **IDs** — `uuid.New().String()` for primary keys. Solana escrow IDs are the same UUID cast to `[16]byte`.
- **Timestamps** — store UTC; serialize as RFC3339.
- **Swagger** — handler comments use `@Summary`, `@Tags`, `@Router`, `@Security BearerAuth` annotations. After changing annotations, run `task backend:docs`.
- **Concurrency** — goroutines are launched only from `main.go` (listener, workers, price refresher, consumer groups). Keep package code single-goroutine-friendly where possible.

## Testing

- `task backend:test` runs the full suite. Only [internal/solana/decoder_test.go](internal/solana/decoder_test.go) currently has coverage — when extending decoders, add round-trip test cases against the recorded log lines.
- There is no integration-test harness for Kafka/Postgres; prefer unit-testing service logic with interfaces (`CentrifugoPublisher` in `order.Service` is the existing example) and leaving wiring to `main.go`.

## Gotchas

- **Nonces are in-memory only.** Multiple backend replicas will not share them; sticky sessions or a shared store are required for HA.
- **Kafka consumer offsets start at newest.** A fresh environment will miss any Solana events emitted before the consumer group is first created. Re-emit or backfill if needed.
- **`/escrow/*` routes are unauthenticated** — they're currently wired outside the protected group. If you expose the backend to untrusted networks, gate them with auth or a separate admin service before shipping.
- **Anchor discriminators** in [escrow/service.go](internal/escrow/service.go) and [solana/events.go](internal/solana/events.go) are magic bytes. Changing a Rust instruction name without updating both will cause silent mis-routing or dropped events.
- **`solana.MustPublicKeyFromBase58` and `uuid.MustParse`** will panic on malformed input. Worker code uses them on DB-loaded values that should already be valid — if you introduce a path where they could see user input, switch to the non-`Must` variants and handle the error.
- **Dispute resolution off-chain path is currently chain-only.** [order/service.go](internal/order/service.go) calls `escrowSvc.OpenDispute` / `ResolveDispute*` and relies on the Solana event loop to flip the DB status. The commented-out direct DB updates are deliberate — leave the consumer as the single source of truth for status.
