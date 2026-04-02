# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DecentraRent is a Solana-based decentralized rental platform. Loaners and landlords negotiate rental agreements via real-time chat, create on-chain escrow contracts, and manage payments through a Solana Anchor program. The system uses event-driven architecture: Solana blockchain events flow through Kafka to the backend, which broadcasts updates via Centrifugo WebSockets to the React frontend.

## Commands

All commands use [Task](https://taskfile.dev/) runner. Run `task --list` to see all available tasks.

### Docker (full stack)
```
task up          # Start all services (frontend, backend, db, kafka, minio, centrifugo)
task down        # Stop all services
task logs        # Tail all service logs
task db:reset    # Drop and recreate database (destroys data)
```

### Frontend (React + Vite)
```
task frontend:install    # npm install
task frontend:dev        # Vite dev server on :5173
cd frontend && npm run build    # Production build (tsc -b && vite build)
cd frontend && npm run lint     # ESLint
```

### Backend (Go + Chi)
```
task backend:build       # go build ./cmd/server
task backend:test        # go test ./... -v
task backend:docs        # Regenerate Swagger docs (swag init)
```

### Database Migrations
```
task backend:migrate:up                    # Apply all pending migrations
task backend:migrate:down                  # Rollback 1 migration (STEPS=N for more)
task backend:migrate:create NAME=foo       # Create new migration pair
task backend:migrate:version               # Show current version
task backend:migrate:force VERSION=N       # Force version (fix dirty state)
```

### Blockchain (Anchor)
```
task build          # anchor build + copy IDL to frontend
task deploy         # anchor deploy to devnet
task anchor:test    # Run Anchor integration tests
task idl:copy       # Copy IDL JSON to frontend/src/features/escrow/idl/
```

## Architecture

### Tech Stack
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS 4, Zustand, React Router 7
- **Backend**: Go (Chi router), PostgreSQL 16, Kafka (Sarama), MinIO (S3), Centrifugo v6.7
- **Blockchain**: Solana Anchor 0.32.1 (Rust), Program name: `lease`
- **Solana cluster**: Devnet

### Service Ports
| Service | Port |
|---------|------|
| Frontend (Vite) | 5173 |
| Backend (Go) | 8080 |
| Centrifugo (WebSocket) | 8000 |
| PostgreSQL | 5432 |
| MinIO S3 / Console | 9000 / 9001 |
| Kafka / Kafka UI | 9092 / 8088 |

### Event Flow
```
Solana Program emits event
  -> Solana Listener (WebSocket subscription to program logs)
  -> Decoder extracts typed event
  -> Kafka Producer publishes to topic (solana.deposit.locked, etc.)
  -> Backend Kafka Consumer updates order status in DB
  -> Centrifugo publish broadcasts to WebSocket subscribers
  -> Frontend subscription handler updates Zustand store
```

### Backend Structure (`backend/internal/`)
Each domain follows the **Handler -> Service -> Store** pattern:
- **Handler**: HTTP request/response, route binding
- **Service**: Business logic, Kafka publishing, Centrifugo broadcasting
- **Store**: Database queries (`*sql.DB`)

Key packages:
| Package | Purpose |
|---------|---------|
| `auth` | JWT + Solana wallet signature verification, middleware |
| `chat` | Conversations, messages, Centrifugo proxy hooks (connect/subscribe/publish) |
| `order` | Order lifecycle, Kafka consumers for Solana events |
| `property` | Listings CRUD with eGov verification |
| `media` | MinIO presigned URL uploads, metadata tracking |
| `solana` | WebSocket listener, transaction log decoder |
| `kafka` | Producer/ConsumerGroup wrappers, topic constants |

Entry point: `backend/cmd/server/main.go` — initializes all services, registers routes, starts Kafka consumers and Solana listener.

### Frontend Structure (`frontend/src/`)
Feature-based module organization. Each feature has co-located `components/`, `hooks/`, `store.ts`, and `types.ts`.

| Feature | Purpose |
|---------|---------|
| `auth` | Wallet connection (Solana wallet-adapter) + username/password login |
| `chat` | Real-time messaging via Centrifugo WebSocket |
| `escrow` | Anchor program interaction: PDAs, signing, deposit, rent payment |
| `orders` | Order UI + real-time updates via Centrifugo |
| `properties` | Listing pages and API calls |
| `toast` | Notification system |

Key files:
- `lib/api.ts` — `apiFetch<T>()` generic HTTP client with JWT Bearer auth, base URL `/api` (proxied to backend)
- `lib/centrifugo.ts` — Centrifugo WebSocket singleton
- `features/escrow/program.ts` — Anchor program instance
- `features/escrow/pda.ts` — PDA derivation: seeds `['escrow', landlord, tenant, orderId]`
- `App.tsx` — All routes defined here, wrapped in Solana wallet providers

### Centrifugo Integration
- Config: `centrifugo/config.json`
- Namespaces: `property` (chat, history_size: 50), `orders`
- Channel format: `property:<property_id>:chat:<loaner_id>`
- Backend proxy endpoints: `/centrifugo/connect`, `/centrifugo/subscribe`, `/centrifugo/publish`
- The publish proxy saves messages to DB before Centrifugo delivers them to subscribers

### Authentication
Dual strategy — wallet-first:
1. **Wallet auth**: `GET /auth/nonce?wallet=` -> sign message -> `POST /auth/verify` -> JWT
2. **Credentials**: `POST /auth/login` or `POST /auth/signup` -> JWT
- JWT has 24h expiry, includes `UserID` and `WalletAddress` in claims
- Frontend stores token in Zustand with localStorage persistence

### Solana Program
- Devnet Program ID: `GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY`
- Localnet Program ID: `6pbgJgKEzw4XigAzvfoR4zEts3arXCyYuF4J5pzgnzuh`
- Source: `blockchain/lease/programs/lease/src/`
- IDL copied to frontend via `task idl:copy`

### Kafka Topics
User events: `order.created`, `order.signed`, `order.activated`, `order.expired`, `order.settled`, `order.dispute.opened`, `order.dispute.resolved`, `order.rent.paid`
Solana events: `solana.deposit.locked`, `solana.party.signed`, `solana.escrow.expired`

## Dev Environment

- Vite proxies `/api/*` to `http://backend:8080` (configured via `API_URL` env var in dev compose)
- Backend uses `air` for live reload in Docker (watches `*.go`, rebuilds to `tmp/main`)
- Swagger UI: `http://localhost:8080/swagger/index.html`
- MinIO Console: `http://localhost:9001` (user: decentrarent / decentrarent)
- Kafka UI: `http://localhost:8088`
