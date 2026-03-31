# Escrow Contract Client & Taskfile Design

**Date:** 2026-03-31
**Status:** Draft
**Scope:** Frontend Anchor client for the lease escrow contract + Taskfile.yml for dev workflow

---

## Overview

Add a frontend contract client layer that lets the React app send transactions to the Solana lease escrow program. The client uses Anchor's typed `Program` API wrapped in React hooks with transaction status tracking via Zustand. A root-level `Taskfile.yml` consolidates dev commands (Docker, Anchor build/deploy, IDL sync).

## Constraints

- **Frontend-only instructions:** `lock_deposit`, `landlord_sign`, `tenant_sign`, `pay_rent` (4 of 9). Authority instructions (disputes, expiry, release) are out of scope.
- **Write-only:** No on-chain reads — backend listens to contract events and manages order state.
- **Transaction feedback:** Each hook tracks `signing → confirming → confirmed | error` via a shared Zustand store.
- **IDL-driven:** The Anchor IDL JSON is copied from the build output into the frontend. `task build` auto-syncs it.

## Architecture

```
UI Component
    ↓ calls hook
usePayRent / useLockDeposit / ...
    ↓ updates store, calls Anchor
Zustand txStore (status, signature, error)
    ↓
program.methods.payRent(amount).accounts({...}).rpc()
    ↓
Anchor Program (from IDL + AnchorProvider)
    ↓
Solana RPC (devnet)
```

## File Structure

```
frontend/src/features/escrow/
├── idl/
│   └── lease.json            # Anchor IDL (copied from build output)
├── program.ts                # Anchor Program instance factory
├── pda.ts                    # PDA derivation + orderId conversion
├── store.ts                  # Transaction status Zustand store
└── hooks/
    ├── useLockDeposit.ts     # Tenant locks deposit
    ├── useLandlordSign.ts    # Landlord signs lease
    ├── useTenantSign.ts      # Tenant signs lease
    └── usePayRent.ts         # Tenant pays rent
```

## Module Details

### `program.ts` — Anchor Program Factory

Exports a `getProgram(connection, wallet)` function that returns an Anchor `Program` instance.

- Takes `Connection` (from `useConnection`) and `AnchorWallet` (from `useAnchorWallet`)
- Creates an `AnchorProvider` with `{ commitment: 'confirmed' }`
- Returns `new Program(idl, provider)` using the imported IDL JSON
- Program ID: `GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY` (devnet)

### `pda.ts` — PDA Derivation

Exports:
- `getEscrowPDA(programId, landlord, tenant, orderId)` → `[PublicKey, number]`
  - Seeds: `["escrow", landlord.toBytes(), tenant.toBytes(), orderIdBytes]`
- `uuidToBytes(uuid: string)` → `Uint8Array(16)` — strips hyphens, converts hex to 16-byte array

### `store.ts` — Transaction Status Store

```ts
type TxStatus = 'idle' | 'signing' | 'confirming' | 'confirmed' | 'error'

interface TxState {
  status: TxStatus
  signature: string | null
  error: string | null
}

interface TxStore {
  txState: TxState
  setSigning: () => void
  setConfirming: (signature: string) => void
  setConfirmed: () => void
  setError: (error: string) => void
  reset: () => void
}
```

- Single transaction at a time (no map of concurrent txs)
- No persistence — transaction state is ephemeral
- `reset()` returns to `idle` state

### Hooks

Each hook follows the same pattern:

1. Get `connection` from `useConnection()`, `wallet` from `useAnchorWallet()`
2. Guard: if wallet is null, set store → `error` with "Wallet not connected" and return early
3. Build `Program` via `getProgram(connection, wallet)`
4. Set store → `signing`
5. Call `program.methods.<instruction>(...args).accounts({...}).rpc()`
6. Set store → `confirming` with signature
7. Await `connection.confirmTransaction(signature, 'confirmed')`
8. Set store → `confirmed` (or `error` on failure)

#### `useLockDeposit`

```ts
lockDeposit(params: {
  orderId: string           // UUID string
  landlordPubkey: string    // base58 pubkey
  authorityPubkey: string   // base58 pubkey
  depositLamports: number   // deposit in lamports
  deadlineTs: number        // unix timestamp (seconds)
}) => Promise<string>       // returns tx signature
```

- Signer: connected wallet (tenant)
- Derives escrow PDA from landlord + tenant (connected wallet) + orderId
- Passes `system_program` account

#### `useLandlordSign`

```ts
landlordSign(params: {
  tenantPubkey: string      // base58 pubkey
  orderId: string           // UUID string
}) => Promise<string>
```

- Signer: connected wallet (landlord)
- Derives escrow PDA from landlord (connected wallet) + tenant + orderId

#### `useTenantSign`

```ts
tenantSign(params: {
  landlordPubkey: string    // base58 pubkey
  orderId: string           // UUID string
}) => Promise<string>
```

- Signer: connected wallet (tenant)
- Derives escrow PDA from landlord + tenant (connected wallet) + orderId

#### `usePayRent`

```ts
payRent(params: {
  landlordPubkey: string    // base58 pubkey
  orderId: string           // UUID string
  amountLamports: number    // rent amount in lamports
}) => Promise<string>
```

- Signer: connected wallet (tenant)
- Derives escrow PDA from landlord + tenant (connected wallet) + orderId
- Passes `landlord` and `system_program` accounts

### Error Handling

Anchor errors from the contract are parsed and surfaced in `txState.error`. Known error codes:

| Code | Name | Meaning |
|------|------|---------|
| 6000 | InvalidAmount | Amount must be > 0 |
| 6001 | InvalidDeadline | Deadline must be in the future |
| 6004 | InvalidStatus | Wrong escrow status for this operation |
| 6005 | Unauthorized | Signer doesn't match expected role |
| 6006 | AlreadySigned | Party already signed |
| 6007 | Overflow | Arithmetic overflow |

Wallet rejection (user cancels signing) sets status to `error` with message "Transaction rejected".

## Dependencies

New frontend dependencies:
- `@coral-xyz/anchor` — Anchor TypeScript client
- `@solana/web3.js` — already installed

No other new dependencies needed.

## Taskfile.yml

Root-level `Taskfile.yml` with the following tasks:

### Infrastructure

| Task | Command | Description |
|------|---------|-------------|
| `up` | `docker compose up -d` | Start all services |
| `down` | `docker compose down` | Stop all services |
| `logs` | `docker compose logs -f` | Tail all service logs |
| `db:reset` | `docker compose down -v` then `docker compose up -d db` | Reset database (drops volume) |

### Blockchain

| Task | Command | Description |
|------|---------|-------------|
| `build` | `cd blockchain/lease && anchor build` | Build Anchor program (auto-runs `idl:copy`) |
| `deploy` | `cd blockchain/lease && anchor deploy` | Deploy to devnet |
| `anchor:test` | `cd blockchain/lease && anchor test` | Run Anchor integration tests |
| `idl:copy` | Copy `blockchain/lease/target/idl/lease.json` → `frontend/src/features/escrow/idl/lease.json` | Sync IDL to frontend |

### Frontend

| Task | Command | Description |
|------|---------|-------------|
| `frontend:dev` | `cd frontend && npm run dev` | Start Vite dev server (standalone) |
| `frontend:install` | `cd frontend && npm install` | Install frontend dependencies |

### Dependency Chain

- `build` → automatically runs `idl:copy` after successful build
