# DecentraRent

Decentralized rental platform on Solana. Tenants and landlords negotiate via real-time chat, create on-chain escrow contracts, and manage rental payments — all without a centralized middleman.

## What It Does

1. **Landlord** lists a property with price, photos, and rental terms
2. **Tenant** finds the listing, opens a chat with the landlord
3. Both parties negotiate and create a **rental order** (rent amount, deposit, dates)
4. Tenant locks a **deposit into an on-chain escrow** (Solana program)
5. Both parties **sign the escrow** on-chain — the contract becomes active
6. Tenant **pays rent** periodically (SOL transferred directly to landlord)
7. At the end — deposit is released back to tenant, or disputed if there's a conflict
8. **Disputes** are resolved by an admin (in the future will be through onchain dispute protocol) with evidence (photos, chat history)

All financial operations happen on Solana devnet. Chat, notifications, and order management are handled by the backend.

## TODO

1. [] **Decentralized Identity** - identify users and their properties IRL (Abdarrakhman)
  - SAS (Solana Attestation Service)
  - 
2. [] **On-chain dispute resolution** - Justice protocol (Andrew), analog of [Kleros.io](https://kleros.io)
3. [] **On-Chain document storage** - Store documents privately (visible only for 2 parties + juries)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Zustand |
| **Backend** | Go (Chi router), PostgreSQL, Kafka (Sarama), MinIO (S3) |
| **Real-time** | Centrifugo v6 (WebSocket) |
| **Blockchain** | Solana, Anchor 0.32.1 (Rust), Devnet |
| **Infra** | Docker Compose, Air (live reload) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React Frontend (:5173)                      │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Auth   │  │  Chat   │  │  Orders  │  │  Escrow  │             │
│  │(wallet) │  │(messages│  │(list,card│  │(PDA,sign │             │
│  │         │  │ photos) │  │ status)  │  │ deposit) │             │
│  └────┬────┘  └────┬────┘  └────┬─────┘  └────┬─────┘             │
│       │            │            │              │                    │
│       │  HTTP      │ WebSocket  │  HTTP        │  RPC (JSON)       │
│       │  /api/*    │ (centrifugo│  /api/*      │  (wallet-adapter) │
└───────┼────────────┼────────────┼──────────────┼────────────────────┘
        │            │            │              │
        ▼            ▼            ▼              ▼
┌───────────────────────────┐          ┌─────────────────────┐
│    Go Backend (:8080)     │          │   Solana Devnet     │
│                           │          │   (Anchor Program)  │
│  ┌─────┐ ┌──────┐ ┌────┐ │          │                     │
│  │Auth │ │ Chat │ │Order│ │          │  lock_deposit       │
│  │     │ │      │ │     │◄──────────────pay_rent           │
│  └──┬──┘ └──┬───┘ └──┬──┘ │  events │  tenant/landlord_   │
│     │       │        │    │  (logs) │  sign                │
│  ┌──┴───────┴────────┴──┐ │         │  release_deposit     │
│  │      Services        │ │         │  open_dispute        │
│  └──┬───────┬────────┬──┘ │         │  resolve_dispute     │
│     │       │        │    │         └─────────────────────┘
│     ▼       ▼        ▼    │
│  ┌─────┐ ┌──────┐ ┌────┐ │
│  │Store│ │Kafka │ │S3  │ │
│  │(SQL)│ │(pub) │ │(img)│ │
│  └──┬──┘ └──┬───┘ └──┬──┘ │
└─────┼───────┼────────┼────┘
      │       │        │
      ▼       ▼        ▼
┌──────────┐ ┌─────┐ ┌──────┐
│PostgreSQL│ │Kafka│ │MinIO │
│ (:5432)  │ │(:9092)│ │(:9000)│
└──────────┘ └──┬──┘ └──────┘
                │
      ┌─────────┴─────────┐
      ▼                   ▼
┌──────────┐        ┌───────────┐
│Centrifugo│        │  Solana   │
│ (:8000)  │        │ Listener  │
│(WebSocket│        │(WS to RPC)│
│ to users)│        └───────────┘
└──────────┘
```


### Solana Program

Anchor program `lease` with instructions:

| Instruction | Description |
|-------------|-------------|
| `lock_deposit` | Tenant locks deposit into escrow PDA |
| `tenant_sign` / `landlord_sign` | Both parties sign to activate the lease |
| `pay_rent` | Tenant pays rent (SOL -> landlord directly) |
| `release_deposit` | Return deposit to tenant after lease ends |
| `open_dispute` | Either party opens a dispute |
| `resolve_dispute_tenant` / `resolve_dispute_landlord` | Admin resolves in favor of one party |
| `expire_escrow` | Refund deposit if signing deadline passes |

PDA seeds: `['escrow', landlord_pubkey, tenant_pubkey, order_id]`

## Getting Started

### Prerequisites

- Docker + Docker Compose
- [Task](https://taskfile.dev/) runner (`brew install go-task`)
- Node.js 20+ (for local frontend dev)
- Go 1.21+ (for local backend dev)
- Solana CLI + Anchor CLI (for blockchain dev)

### Quick Start (Docker)

```bash
# Start everything
task up

# Check logs
task logs

# Stop
task down

# Full reset (wipes DB, MinIO, Kafka)
task down
docker compose down -v
task up
```

### Services After Launch

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| Swagger | http://localhost:8080/swagger/index.html |
| MinIO Console | http://localhost:9001 (decentrarent/decentrarent) |
| Kafka UI | http://localhost:8088 |
| Centrifugo | http://localhost:8000 |

### Local Development

```bash
# Frontend
task frontend:install
task frontend:dev

# Backend
task backend:build
task backend:test

# Database migrations
task backend:migrate:up
task backend:migrate:down
task backend:migrate:create NAME=add_something

# Blockchain
task build       # anchor build + copy IDL to frontend
task deploy      # deploy to devnet
task anchor:test # integration tests
```

## Authentication

Two methods:

1. **Wallet auth** (primary): Connect Solana wallet -> sign nonce -> JWT
2. **Password auth**: Signup/login with username + password -> JWT

JWT tokens expire in 24 hours. All protected API routes require `Authorization: Bearer <token>` header.

## Kafka Topics

| Topic | Source | Description |
|-------|--------|-------------|
| `solana.deposit.locked` | Solana listener | Deposit locked in escrow |
| `solana.party.signed` | Solana listener | Party signed the escrow |
| `solana.escrow.expired` | Solana listener | Escrow expired |
| `solana.rent.paid` | Solana listener | Rent payment confirmed |
| `order.created` | Backend | New order created |
| `order.activated` | Backend | Order became active |
| `order.dispute.opened` | Backend | Dispute opened |

## API Overview

### Public
- `GET /sol-price` — Current SOL/USDT price
- `GET /properties` — List properties
- `GET /properties/:id` — Property details

### Protected (JWT required)
- `POST /orders` — Create rental order
- `GET /orders` — List user's orders (with USDT conversion)
- `POST /orders/:id/accept` — Accept order
- `POST /orders/:id/dispute` — Open dispute
- `POST /conversations` — Start chat
- `POST /conversations/:id/photos/upload-url` — Get photo upload URL
- `POST /conversations/:id/photos` — Send photo in chat

Full API docs: http://localhost:8080/swagger/index.html

## Project Structure

```
decentrarent/
  backend/
    cmd/server/          # Entry point
    internal/            # Domain packages (auth, chat, order, ...)
    migrations/          # SQL migrations
  frontend/
    src/
      features/          # Feature modules (auth, chat, escrow, orders, ...)
      pages/             # Route pages
      lib/               # Shared utilities (api client, centrifugo, token utils)
  blockchain/
    lease/
      programs/lease/    # Anchor program (Rust)
      tests/             # Integration tests
  centrifugo/
    config.json          # Centrifugo configuration
  docker-compose.yml     # Production compose
  docker-compose.dev.yml # Dev overrides (live reload, volumes)
  Taskfile.yml           # Task runner commands
```
