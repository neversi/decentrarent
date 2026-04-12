# CLAUDE.md — Blockchain

This file provides guidance to Claude Code (claude.ai/code) when working inside `blockchain/`.
For project-wide context see the top-level [CLAUDE.md](../CLAUDE.md); for how the backend drives this program see [backend/CLAUDE.md](../backend/CLAUDE.md).

## Purpose

The only thing that lives here is the `lease` Anchor program — the on-chain source of truth for DecentraRent escrows. It:

- Holds the tenant's deposit in a PDA until the rental either settles, expires, or is resolved by dispute.
- Collects rent payments directly from tenant to landlord (rent does NOT sit in escrow; only the deposit does).
- Emits Anchor events that the backend's Solana listener decodes and turns into Kafka messages.
- Gates admin-only instructions (`open_dispute`, `resolve_dispute_*`, `expire_escrow`, `release_deposit_to_tenant`) behind an `authority` pubkey stored on the account at `lock_deposit` time.

## Commands

Run from repo root via [Task](https://taskfile.dev/):

```
task build            # anchor build + copy IDL to frontend/src/features/escrow/idl/
task deploy           # anchor deploy (uses cluster from Anchor.toml)
task upgrade          # anchor build + anchor upgrade (devnet program id hardcoded in task)
task anchor:test      # anchor test (runs tests/lease.ts — see caveat below)
task idl:copy         # Just the IDL sync step
```

The Rust integration suite (`programs/lease/tests/integration_test.rs`) is NOT run by `anchor test`. Use:

```
cd blockchain/lease
anchor build
SBF_OUT_DIR=$(pwd)/target/deploy cargo test -p lease -- --nocapture
```

(Note is also in the top of `integration_test.rs`.)

## Layout

```
blockchain/lease/
├── Anchor.toml                    # Cluster, wallet, program IDs per cluster
├── Cargo.toml                     # Workspace (members = programs/*)
├── id.json                        # Deployer keypair — do NOT commit a prod key here
├── package.json                   # Anchor 0.32.1 TS client deps
├── migrations/deploy.ts           # Anchor post-deploy hook (currently a no-op)
├── tests/lease.ts                 # ts-mocha harness — STUB, calls .initialize() which doesn't exist
└── programs/lease/
    ├── Cargo.toml                 # anchor-lang 0.32.1 + dev-deps (solana-program-test 2.1, tokio, uuid)
    ├── src/
    │   ├── lib.rs                 # #[program] — all 9 instructions live here
    │   ├── error.rs               # EscrowError (13 variants, codes 6000–6012)
    │   └── models/
    │       ├── mod.rs
    │       ├── accounts.rs        # #[derive(Accounts)] contexts + EscrowAccount + SIZE
    │       ├── event.rs           # #[event] structs
    │       └── status.rs          # EscrowStatus enum
    └── tests/integration_test.rs  # solana-program-test — real coverage lives here
```

## Program IDs

Defined in three places that must stay in sync:

| Location | Purpose |
|----------|---------|
| `declare_id!` in [programs/lease/src/lib.rs](lease/programs/lease/src/lib.rs) | Baked into the `.so` |
| `Anchor.toml` `[programs.devnet]` / `[programs.localnet]` | Used by `anchor deploy` / `anchor test` |
| `integration_test.rs` `PROGRAM_ID` const | Used by `cargo test` |

Current values:

- Devnet: `GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY`
- Localnet: `6pbgJgKEzw4XigAzvfoR4zEts3arXCyYuF4J5pzgnzuh`

If you redeploy with a new keypair: update `declare_id!`, both `Anchor.toml` entries, the test const, `backend/internal/escrow/service.go` `ProgramID`, and `backend/internal/config/config.go` `SolanaProgramID` default. Missing any one causes silent mis-routing.

## PDA Derivation

Every non-init instruction re-derives the escrow PDA from the stored fields (tenant key in `TenantSign`, landlord key in `LandlordSign`, both from `escrow.*` elsewhere):

```
seeds = [b"escrow", landlord.key().as_ref(), tenant.key().as_ref(), order_id[16]]
```

`order_id` is a 16-byte UUID. The backend passes `uuid.UUID` bytes as `[16]byte` (see [backend/internal/escrow/service.go](../backend/internal/escrow/service.go) `FindEscrowPDA`). Keep this seed tuple identical on both sides — any drift breaks PDA resolution.

## Instructions

All 9 live in [programs/lease/src/lib.rs](lease/programs/lease/src/lib.rs).

| Instruction | Signer | Purpose | Emits |
|-------------|--------|---------|-------|
| `lock_deposit(order_id, deposit_amount, deadline_ts, period, start_date, end_date, price_rent)` | tenant | Init escrow PDA, transfer deposit lamports in, status → `AwaitingSignatures` | `DepositLocked` |
| `landlord_sign()` | landlord | Flip `landlord_signed`; if both signed → status `Active` | `PartySignedEvent` (+ `DocumentSigned` when active) |
| `tenant_sign()` | tenant | Flip `tenant_signed`; if both signed → status `Active` | `PartySignedEvent` (+ `DocumentSigned` when active) |
| `pay_rent(amount)` | tenant | System-transfer `amount` directly tenant→landlord; must equal `price_rent`; capped at `total_periods × price_rent` | `RentPaid` |
| `release_deposit_to_tenant()` | authority | Normal end-of-lease refund; status `Active` → `Settled` | `DepositReleased` (reason: `"normal_end"`) |
| `open_dispute(reason)` | authority | Freeze deposit; `Active` → `Disputed`; `reason.len() ≤ 200` | `DisputeOpened` |
| `resolve_dispute_tenant(reason)` | authority | Payout deposit to tenant; `Disputed` → `DisputeResolvedTenant` | `DepositReleased` |
| `resolve_dispute_landlord(reason)` | authority | Payout deposit to landlord; `Disputed` → `DisputeResolvedLandlord` | `DepositReleased` |
| `expire_escrow()` | authority | After `deadline` passed without both sigs; refund tenant; `AwaitingSignatures` → `Expired` | `EscrowExpired` |

Transfer mechanics:

- `lock_deposit` and `pay_rent` use `system_program::transfer` (CPI) — they move from a Signer.
- All payouts from the escrow PDA use direct lamport mutation: `**escrow.try_borrow_mut_lamports()? -= amount; **recipient.try_borrow_mut_lamports()? += amount`. This is the standard Anchor pattern for sending lamports *out of* a PDA, because system_program::transfer can't sign for a non-signer account.

## Validation Rules (from `lock_deposit`)

- `deposit_amount > 0`, `price_rent > 0`, `period > 0`
- `deadline_ts > now`
- `end_date > now`
- `end_date > start_date`
- `(end_date - start_date) % period == 0` — lease duration must be an integer number of periods

`pay_rent` additionally enforces `amount == escrow.price_rent` and caps cumulative `total_rent_paid` at `total_periods × price_rent` (checked-math with `RentOverpaid` on overflow attempt).

Dispute-related `reason` args are capped at 200 bytes.

## Accounts ([models/accounts.rs](lease/programs/lease/src/models/accounts.rs))

### `EscrowAccount` (SIZE = 179 bytes incl. discriminator)

```
order_id          [u8; 16]
landlord          Pubkey
tenant            Pubkey
authority         Pubkey
deposit_amount    u64
total_rent_paid   u64
status            EscrowStatus (1 byte)
created_at        i64        ← declared in struct but NOT written by lock_deposit
deadline          i64
landlord_signed   bool
tenant_signed     bool
bump              u8
period            i64
start_date        i64
end_date          i64
price_rent        u64
```

**Gotcha**: `created_at` is in the struct + `SIZE` calc but `lock_deposit` never sets it, so it's always `0`. If anyone starts reading it, initialize it in `lock_deposit` with `clock.unix_timestamp` or drop the field.

### Instruction contexts

- `LockDeposit` — tenant signer, landlord + authority as `UncheckedAccount` (we only store the pubkey), escrow `init` with `payer = tenant`.
- `LandlordSign` / `TenantSign` — respective signer + escrow; seed check re-derives PDA using the *signer's* key and pulls the counterparty key from the stored `escrow.*`. Plus an explicit `constraint = escrow.<role> == signer.key() @ Unauthorized`.
- `PayRent` — tenant signer, landlord `UncheckedAccount` (mutable for lamport receive), escrow. Dual constraint that both match what's stored.
- `ReleaseDeposit` — used by `release_deposit_to_tenant`, `resolve_dispute_tenant`, `resolve_dispute_landlord`. authority signer + both parties (unchecked, mut). Direction is decided by which instruction uses it, not by the context.
- `AuthorityOnly` — used only by `open_dispute`. authority + escrow.
- `ExpireEscrow` — authority + tenant (unchecked, mut) + escrow.

Every context after `LockDeposit` constrains `authority.key() == escrow.authority` (or the appropriate party key), so rotating the authority mid-lease means the old PDA is stuck with the original signer.

## Status Machine ([models/status.rs](lease/programs/lease/src/models/status.rs))

```
AwaitingSignatures
  ├── (both sign)           → Active
  └── (expire_escrow)       → Expired
Active
  ├── (release_to_tenant)   → Settled
  └── (open_dispute)        → Disputed
Disputed
  ├── (resolve_dispute_tenant)   → DisputeResolvedTenant
  └── (resolve_dispute_landlord) → DisputeResolvedLandlord
```

`Expired`, `Settled`, `DisputeResolvedTenant`, `DisputeResolvedLandlord` are terminal. The enum is `AnchorSerialize` as a u8 discriminant in order of declaration — don't reorder variants without bumping a migration plan; backend decoders index by position.

## Events ([models/event.rs](lease/programs/lease/src/models/event.rs))

| Event | Fields | Backend decoder |
|-------|--------|-----------------|
| `DepositLocked` | escrow, landlord, tenant, deposit_amount, deadline, order_id | `solana.deposit.locked` |
| `PartySignedEvent` | escrow, signer, role (`"landlord"`/`"tenant"`) | `solana.party.signed` |
| `DocumentSigned` | escrow, order_id | (not consumed — informational) |
| `RentPaid` | escrow, tenant, landlord, amount, total_paid, paid_at | `solana.rent.paid` |
| `DepositReleased` | escrow, recipient, amount, reason | `solana.dispute.released` (also fires on `release_deposit_to_tenant`) |
| `DisputeOpened` | escrow, reason | `solana.dispute.opened` |
| `EscrowExpired` | escrow, refunded_to, amount | `solana.escrow.expired` |

**Gotcha**: `DepositReleased` fires for BOTH the normal end-of-lease (`release_deposit_to_tenant`, reason `"normal_end"`) and the two dispute resolutions. The backend's `handleDepositReleased` only acts if the order is currently in `StatusDisputed`, so normal-end events are effectively dropped. If you ever want to handle normal end on-chain-driven, teach the consumer to differentiate by status or reason string.

## Errors ([error.rs](lease/programs/lease/src/error.rs))

Anchor assigns 6000 + variant-index. The backend maps them in `parseAnchorError` in [backend/internal/escrow/service.go](../backend/internal/escrow/service.go):

| Code | Variant | Message |
|------|---------|---------|
| 6000 | `InvalidAmount` | Amount must be greater than zero |
| 6001 | `InvalidDeadline` | Deadline must be in the future |
| 6002 | `DeadlineNotReached` | Deadline has not been reached yet |
| 6003 | `DeadlineExpired` | Escrow deadline has expired |
| 6004 | `InvalidStatus` | Invalid escrow status for this operation |
| 6005 | `Unauthorized` | Unauthorized signer |
| 6006 | `AlreadySigned` | Already signed |
| 6007 | `Overflow` | Arithmetic overflow |
| 6008 | `ReasonTooLong` | Reason too long (max 200 chars) |
| 6009 | `InvalidEndDate` | Invalid end date |
| 6010 | `InvalidTimestamp` | Invalid timestamp |
| 6011 | `InvalidPeriod` | Invalid period |
| 6012 | `RentOverpaid` | Rent overpaid |

Adding a new variant: append to the enum (do NOT insert in the middle — breaks codes), then extend the backend map. Also update `backend/CLAUDE.md`'s Anchor error note if the range grows past 6012.

## Testing

Two separate harnesses, only one currently useful:

### Rust integration suite (primary) — [programs/lease/tests/integration_test.rs](lease/programs/lease/tests/integration_test.rs)

Uses `solana-program-test` + `tokio`. Builds raw instructions by hand (discriminators hardcoded, Borsh-encoded args) rather than going through the Anchor client — this is the reference for how the backend should be encoding things. Run with:

```
anchor build
cd blockchain/lease
SBF_OUT_DIR=$(pwd)/target/deploy cargo test -p lease -- --nocapture
```

Current coverage: happy paths for `lock_deposit`, `landlord_sign`, `tenant_sign` (both-sign → Active), `pay_rent`, `release_deposit_to_tenant`, both dispute resolutions, plus two negative cases (`test_cannot_sign_twice`, `test_cannot_pay_rent_before_both_signed`). No coverage for `expire_escrow`, `open_dispute` as a standalone, or end-date / period validation.

**Discriminator table in the test file** (`integration_test.rs:521`) duplicates the one in `backend/internal/escrow/service.go`. If you rename an instruction, three places update: the function in `lib.rs`, this test map, and the backend map.

### TS suite — [tests/lease.ts](lease/tests/lease.ts)

Stub from `anchor init`. Calls `program.methods.initialize()` which doesn't exist in `lib.rs`. `anchor test` will fail. Either rewrite it to exercise real instructions or remove it — right now it's noise.

## Anchor Version

- `anchor-lang = "0.32.1"` ([programs/lease/Cargo.toml](lease/programs/lease/Cargo.toml))
- `@coral-xyz/anchor = "^0.32.1"` ([package.json](lease/package.json))
- Install Anchor CLI matching these via `avm install 0.32.1 && avm use 0.32.1`.

Bumping Anchor: regenerate the IDL and re-run `task idl:copy` so the frontend's TS client matches. Also re-verify every instruction discriminator — Anchor's discriminator algorithm has been stable (sha256("global:<name>")[..8]) but any change would silently desync both the backend and the Rust test map.

## IDL Pipeline

`anchor build` writes `target/idl/lease.json` and `target/types/lease.ts`. `task idl:copy` copies the JSON into [frontend/src/features/escrow/idl/lease.json](../frontend/src/features/escrow/idl/lease.json). Frontend uses this for type-safe instruction building; backend does NOT read the IDL at runtime (it hardcodes discriminators), so a stale IDL in the repo won't break the backend — but will break the frontend after a program change. Always pair an `anchor build` with `task idl:copy`.

## Gotchas

- **`created_at` is never set.** Field is reserved in the account layout but `lock_deposit` omits the assignment. Always reads as 0.
- **`DepositReleased` is overloaded** — fires for normal end AND dispute resolutions, backend only treats it as dispute-resolution. If you surface normal-end events, disambiguate by `reason` or by pre-state.
- **`tests/lease.ts` is a broken stub.** Don't rely on `anchor test`; use `cargo test -p lease`.
- **Three discriminator tables in sync**: the on-chain instruction names (lib.rs), the Rust test map (`integration_test.rs:521`), the backend Go map (`escrow/service.go`). Rename = three-place edit.
- **`EscrowStatus` enum order is load-bearing.** Backend decodes the status byte by position; reordering variants silently remaps statuses on already-deployed accounts.
- **Authority rotation mid-lease is impossible.** The authority pubkey is captured at `lock_deposit` and constrained on every admin call. If you lose the authority key, all in-flight escrows can only finish via `landlord_sign` + `tenant_sign` → natural on-chain state transitions; they cannot be expired/disputed/released.
- **`id.json` is the deployer keypair** and is committed. Treat the current one as devnet-only; never reuse for mainnet without rotating.
- **Upgrade is hardcoded to the devnet program id** in `Taskfile.yml`'s `upgrade` task. Editing the task is required before upgrading a different deployment.
