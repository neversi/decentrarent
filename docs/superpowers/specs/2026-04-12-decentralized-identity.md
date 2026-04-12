# Decentralized Identity & Property Attestation (SAS) — Design

**Spec date:** 2026-04-12
**Status:** Design (re-architected from first principles on 2026-04-12; supersedes the original 2026-04-12 draft)
**Scope:** Off-chain verification orchestration and on-chain attestation issuance, using the real **Solana Attestation Service**. Escrow internals are out of scope (see `2026-03-31-escrow-contract-client-design.md`).

---

## 1. Overview

DecentraRent needs trust-minimized, composable proof that (a) a wallet belongs to a verified real human, and (b) a given wallet owns a given real-world property. This spec defines how those proofs are produced, stored, and consumed on Solana — using the **Solana Attestation Service (SAS)** as the on-chain primitive.

The design treats DecentraRent not as a monolithic KYC/AML system but as a **session orchestrator** that dispatches verification work to pluggable providers (starting with our own manual-review team) and issues SAS attestations on their signed outcomes. Any future consumer — the existing rental-escrow program, a disputes program, a secondary-rental marketplace — checks attestations through a common verifier interface.

Two guiding principles:

1. **Zero PII on-chain.** Only jurisdictional and policy-relevant fields travel to Solana. Names, DOBs, and ID numbers never leave the verification provider.
2. **Framework over custom.** SAS already defines attestation accounts, signing, revocation, and fetching. We do not re-implement those primitives.

---

## 2. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  Off-chain                                                           │
│                                                                      │
│   User / Owner ────▶ Frontend ────▶ Identity/Property Facade         │
│                                       (session orchestrator)         │
│                                           │                          │
│                                           ▼                          │
│                                   Adapter registry                   │
│                        ┌──────────┬──────────┬──────────────┐        │
│                        │ Manual   │ SumSub   │ eGov KZ      │        │
│                        │ adapter  │ adapter  │ adapter      │ ...    │
│                        │ (MVP)    │ (future) │ (future)     │        │
│                        └─────┬────┴────┬─────┴──────┬───────┘        │
│                              │         │            │                │
│                              ▼         ▼            ▼                │
│                         [admin UI] [SumSub]    [eGov portal]         │
│                                                                      │
│   webhook  ◀─────────────────────────────────  provider callback     │
│     │                                                                │
│     ▼                                                                │
│   Session finalizer ──▶ Issuer signer (SAS tx) ──▶ Solana RPC        │
│     │                                                                │
│     └──▶ Arweave upload (property docs only, AES-GCM encrypted)      │
└──────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  On-chain (Solana devnet → mainnet)                                  │
│                                                                      │
│   Solana Attestation Service                                         │
│     ├── Identity schema                                              │
│     ├── Property schema                                              │
│     └── Ownership schema                                             │
│                                                                      │
│   Verifier helpers (Rust crate) ◀── consumed by escrow program       │
└──────────────────────────────────────────────────────────────────────┘
```

**Scope boundary.** This spec ends at issuance. The rental-escrow program and any other consumer programs compile against the verifier helpers (§11) and are otherwise unaffected by changes inside the facade.

---

## 3. Core concepts

### 3.1 Solana Attestation Service (SAS) primitives we use

| SAS primitive | How we use it |
|---|---|
| **Issuer** | One authorized issuer: DecentraRent's backend signing key. Designed to support additional issuers later without schema change. |
| **Schema** | Three registered schemas: `Identity`, `Property`, `Ownership`. Registered once per network (devnet, then mainnet). |
| **Attestation** | One per verified fact. Subject points to either a wallet (identity, ownership) or a property-anchoring PDA (property). |
| **Revocation** | Used on ownership transfer, admin-triggered revocation, and future arbitration-triggered revocation. |

### 3.2 Session

A **Session** is the off-chain unit of a verification attempt: one user, one kind of attestation, one provider. It has a durable ID (`session_id`) that survives webhook retries and client reconnects.

### 3.3 Adapter

An **Adapter** is the integration with one verification provider. Every provider — our own Manual review, SumSub, eGov KZ — implements the same interface (§5.2). Adding a new provider = adding one adapter; nothing else changes.

---

## 4. Schema definitions

Stored on-chain. **Zero PII.** Fields listed are only those escrow or other on-chain consumers can usefully branch on.

### 4.1 `Identity`

**Claim:** "Wallet `W` belongs to a real, KYC-verified human."

**Subject:** the attested wallet `W` (SAS built-in field).

| Field | Type | Purpose |
|---|---|---|
| `nationality` | `[u8; 3]` | ISO 3166-1 alpha-3 code. Supports jurisdictional policy (e.g., "landlord must be KAZ"). |
| `kyc_level` | `u8` | `1` = basic (doc + selfie), `2` = enhanced (basic + PEP/sanctions screening). |
| `verified_at` | `i64` | Unix timestamp. Audit only. |
| `expires_at` | `i64` | Unix timestamp. KYC staleness threshold (default 12 months). |

**Not on-chain:** legal name, date of birth, ID numbers, selfie, PEP/sanctions evidence, provider identity. These live only in the provider's system.

### 4.2 `Property`

**Claim:** "Real-world property `P` exists and was verified."

**Subject:** a PDA derived from `property_id_hash` (deterministic, one per property).

| Field | Type | Purpose |
|---|---|---|
| `property_id_hash` | `[u8; 32]` | SHA-256 of the official property identifier (e.g., cadastral number). Hashed so the number itself is not public. |
| `country` | `[u8; 3]` | ISO 3166-1 alpha-3. Drives adapter selection and legal profile. |
| `property_type` | `u8` | Enum: `0=Apartment`, `1=House`, `2=Commercial`, `3=Land`. |
| `doc_bundle_cid` | `[u8; 32]` | Arweave transaction id (raw 32-byte SHA-256, base64url-displayed as 43 chars off-chain). May be all-zero for API-only providers (eGov cadastral) that return no documents. |
| `verified_at` | `i64` | Unix timestamp. |

**No `expires_at`.** Property existence does not go stale; only ownership does. If a property is demolished or re-registered, the existing attestation is **revoked**, not left to expire.

**Not on-chain:** street address, area/m², rooms, floor plan, notary details, photographs (the last three are inside the encrypted bundle).

### 4.3 `Ownership`

**Claim:** "Wallet `W` owns property `P` as of this attestation."

**Subject:** the owner wallet `W`.

| Field | Type | Purpose |
|---|---|---|
| `property_id_hash` | `[u8; 32]` | Links this ownership claim to a specific `Property` attestation. |
| `share_bps` | `u16` | Ownership share in basis points. `10000` = sole owner. MVP only issues `10000`; the field is present to unblock future co-ownership without a schema change. |
| `verified_at` | `i64` | Unix timestamp. |
| `expires_at` | `i64` | Unix timestamp. Forces periodic re-verification (default 6 months). |

**Not on-chain:** title deed, purchase price, purchase date, co-owner identities.

### 4.4 Why these field choices

- **Jurisdictional (`nationality`, `country`):** On-chain consumers genuinely branch on them (escrow's "must be KAZ" rule). Keeping them on-chain avoids round-trips.
- **Policy-relevant (`kyc_level`, `share_bps`):** Lets consumers enforce tiered rules (e.g., "enhanced KYC required above X rent").
- **Temporal (`verified_at`, `expires_at`):** Required for correctness (renewal, audit).
- **CID (`doc_bundle_cid`):** Makes the attestation independently auditable without trusting our database.

---

## 5. Off-chain architecture — facade + adapters

### 5.1 Session lifecycle

```
            ┌──────────┐
            │ created  │  POST /verify/{kind}/start
            └────┬─────┘
                 │
                 ▼
            ┌────────────┐
            │ dispatched │  adapter.Start() returned a handoff
            └────┬───────┘
                 │
                 ▼
       ┌────────────────────┐
       │ awaiting_provider  │  user acting on provider side
       └─────────┬──────────┘
                 │      webhook arrives
                 ▼
            ┌──────────┐
            │ issuing  │  issuer signing + submitting SAS tx
            └────┬─────┘
                 │
        ┌────────┴────────────┬──────────┐
        ▼                     ▼          ▼
   ┌─────────┐          ┌──────────┐  ┌────────┐
   │ issued  │          │ rejected │  │ failed │
   └─────────┘          └──────────┘  └────────┘
   (terminal, happy)    (terminal)    (terminal, infra error)

   ┌──────────┐
   │ expired  │  TTL reached before callback
   └──────────┘
   (terminal, from any non-terminal state)
```

**TTL:** Sessions in `dispatched` or `awaiting_provider` past `session_ttl` (default 24h) transition to `expired` via a periodic sweep.

**Concurrency rule:** at most one non-terminal session per `(wallet, kind)` pair. Second attempts return the existing session.

### 5.2 Adapter contract

```go
// Indicative Go signature; final API lives in backend/internal/attestation/adapter.go
type Adapter interface {
    // Called once when a session is created. Returns what the user needs to do next.
    Start(ctx context.Context, session Session, callbackURL string) (Handoff, error)

    // Called by the webhook handler with the raw request body and signature header.
    // Must verify the signature and idempotency before returning a Result.
    HandleCallback(ctx context.Context, rawBody []byte, signature string) (SessionID, Result, error)

    // Called when the session is expired/cancelled. Best-effort cleanup at the provider.
    Cancel(ctx context.Context, session Session) error
}

type Handoff struct {
    RedirectURL string            // user agent follows this URL
    Ticket      []byte             // or: embed this token in our UI (e.g., SumSub SDK)
    Expires     time.Time          // adapter-side expiry
}

type Result struct {
    Status           Status         // approved | rejected | needs_more
    AttestableFields map[string]any // nationality, kyc_level, etc. — consumed when building the SAS tx
    ProviderRef      string         // provider's own id, for audit
    RawSignedPayload []byte         // full signed webhook body, persisted for audit
}
```

**Strict PII boundary at the adapter.** Providers commonly return names and DOBs in their webhook payload. `AttestableFields` is the deliberate filter: the facade only reads the keys we expect to attest to. Everything else is persisted in the raw payload for audit and is **never** written into an application-level structure.

**`Status` transition semantics.** Only `approved` and `rejected` move the session into a terminal state (`issuing`/`rejected` respectively). A callback with `Status = needs_more` keeps the session in `awaiting_provider` and surfaces the required follow-up to the user (e.g., "liveness check failed, please retry"). The session does not regress to an earlier state; it simply remains open until a later callback resolves it or the TTL sweep expires it.

### 5.3 MVP adapter: `ManualAdapter`

- **Handoff:** a URL to DecentraRent's admin dashboard session view.
- **User experience:** user uploads docs to a private intake endpoint. Our team reviews them in the admin UI, then clicks Approve/Reject.
- **Callback:** the admin UI submits to `POST /webhooks/manual`, HMAC-signed with a per-adapter secret. The backend treats its own admin UI as an external webhook source — same code path as any other provider.
- **Attestable fields:** reviewer fills in `nationality`, `kyc_level` for identity; selects `property_type`, `country` for property.
- **Raw docs:** kept in MinIO only for the duration of the session. Deleted on terminal state (except rejected + audit hold).

### 5.4 Future adapters (not built in MVP)

- **`SumSubAdapter`** — identity only. Handoff = SumSub web SDK token; callback = SumSub's signed webhook.
- **`EGovKZAdapter`** — identity, Kazakhstan. Handoff = eGov redirect; callback = eGov's webhook.
- **`EGovCadastralAdapter`** — property, Kazakhstan. No user handoff; pure API check ("is this cadastral number owned by this wallet's KYC'd identity?"). Result returned synchronously from `Start` or via immediate callback.

### 5.5 Webhook handling

- Every adapter verifies **HMAC signature** with a provider-specific secret stored as a Kubernetes/env secret (Docker secret for local).
- Every inbound webhook carries an **event id** (either provider-supplied or a hash of the raw body). Processed event ids are persisted in `webhook_events` for at least the session TTL. Duplicate event ids are ignored.
- Callbacks that don't resolve to a session in a non-terminal state are logged and ignored (no error to the provider, to avoid retry storms).

---

## 6. Issuance flows

### 6.1 Identity issuance (end-to-end)

1. User signs a nonce with their wallet to prove ownership; frontend calls `POST /verify/identity/start`.
2. Facade creates session `S` in `created`. Picks the `ManualAdapter` (MVP). Calls `adapter.Start(S, /webhooks/manual)`.
3. Adapter returns a dashboard URL. Session → `dispatched`. Response to client: `{session_id, next: "redirect", url: ...}`. Client navigates to the dashboard intake page.
4. User uploads docs to the intake endpoint (authenticated by `session_id` + wallet signature). Docs land in MinIO. Session → `awaiting_provider`.
5. Admin reviews docs in the dashboard. Clicks Approve. Dashboard posts to `POST /webhooks/manual` with attestable fields.
6. Webhook handler verifies signature + idempotency, finalizes the session. Session → `issuing`.
7. Finalizer builds the SAS `create_attestation` instruction (schema = `Identity`, subject = user's wallet, fields from webhook), signs with issuer signing key, submits via Solana RPC.
8. On confirmation, session → `issued`. Backend publishes to the user's Centrifugo channel; frontend shows success.

### 6.2 Property issuance (end-to-end)

1. **Gate:** `POST /verify/property/start` rejects any wallet without a valid, non-expired, non-revoked on-chain `Identity` attestation. Checked via the verifier helper (§11).
2. Owner signs nonce; facade creates session in `created`. Uploads raw docs + cadastral number to intake (MinIO, session-scoped).
3. Adapter = `ManualAdapter`. Handoff = admin dashboard URL. Session → `dispatched` → `awaiting_provider`.
4. Admin reviews (cross-checks cadastral registry, verifies docs match). Fills in `country`, `property_type`. Clicks Approve. Dashboard posts to `/webhooks/manual` with `{session_id, result, attestable_fields}`.
5. Session → `issuing`. Finalizer:
    - Bundles the reviewed docs into a tarball.
    - AES-256-GCM encrypts with a fresh random key `K`.
    - Wraps `K` for owner + issuer data key (X25519). Uploads bundle to Arweave; persists the key envelope in `property_envelopes` table.
    - Builds two SAS `create_attestation` instructions — `Property` (property exists + CID) and `Ownership` (wallet owns property, `share_bps = 10000`) — and bundles both into a **single transaction** so either both attestations are created or neither is. Partial success (Property without Ownership) must not be a reachable state.
    - Signs with issuer signing key, submits. On confirmation, deletes the raw MinIO copy (encrypted Arweave copy + envelope are sufficient).
6. Session → `issued`. Centrifugo push to user channel.

### 6.3 Fee sponsorship

The issuer signing key is the **fee payer** for every attestation create/revoke transaction. Users never sign or pay for SAS operations. Users do pay their own SOL later when signing rental contracts in the escrow program — that sponsorship is outside this spec.

---

## 7. Document storage & encryption

Applies **only to property docs**. Identity docs stay with the verification provider per the facade's PII boundary (§5.2).

### 7.1 Storage — Arweave

- Pay-once, permanent storage. A rental contract may run for years; deed evidence must outlive operational continuity of DecentraRent.
- Uploads via `@irys/sdk` (or direct Arweave gateway), using a funded wallet held separately from the issuer signing key.
- Storage wallet is an operational key, not an attestation signer. Topped up from treasury as needed.

### 7.2 Encryption scheme

```
      plaintext bundle (tarball of deed, cadastral extract, photos, etc.)
                │
                ▼
     generate random 32-byte AES-256 key K
                │
                ▼
     C = AES-256-GCM(K, plaintext, random 12-byte nonce)
                │
                ▼
     For each recipient R in {owner, issuer_data_key}:
         R_x25519 = ed25519_to_curve25519(R_ed25519)
         K_R      = x25519_seal(K, R_x25519)      // libsodium sealed box
                │
                ▼
    Upload C (ciphertext only) to Arweave. Capture transaction id → doc_bundle_cid.
    Persist the key envelope off-chain:
         { bundle_tx: "...", nonce: "...", recipients: { owner_pubkey: K_owner_hex, issuer_data_pubkey: K_issuer_hex } }
```

### 7.3 Two-object pattern (bundle vs envelope)

| Object | Where | Mutability |
|---|---|---|
| **Ciphertext bundle** | Arweave | Immutable. One Arweave tx id, committed on-chain as `doc_bundle_cid`. |
| **Key envelope** (recipients → wrapped K) | Postgres (`property_envelopes`) | Mutable. New recipients can be added without re-uploading the bundle. |

The envelope is mutable **off-chain** so future features (e.g., tenant on-demand doc access during rental negotiation) can add recipient keys without a new attestation. The bundle hash stays stable on-chain.

### 7.4 Ed25519 → X25519 conversion

Solana wallets sign with Ed25519; encryption wants X25519. Standard conversion: `ed25519_pk_to_curve25519_pk()` from libsodium (also available as a pure-Rust crate for client-side code). One wallet keypair serves both signing and decryption — users don't manage a second key.

### 7.5 MVP recipient set

`{ owner, issuer_data_key }`. Future recipients (tenants viewing during negotiation, auditors, arbitrators) are added by extending the envelope — no schema or storage change required.

---

## 8. Issuer key custody

Two distinct keys, both held by DecentraRent as the issuer:

| Key | Algorithm | Purpose |
|---|---|---|
| **Signing key** | Ed25519 | Signs SAS `create_attestation` and `revoke_attestation` instructions. Fee payer for all issuance txs. |
| **Data key** | X25519 | Wraps/unwraps AES keys in property doc envelopes. Used only for audit retrieval. |

Separate keys limit blast radius: a signing-key compromise allows an attacker to issue rogue attestations (bad, but revocable), while a data-key compromise allows reading archived bundles but not issuing anything.

### 8.1 MVP custody — `.env`, devnet-only

- Both keys stored as environment variables in the backend service.
- Rotatable via secret rollout + key rotation ceremony (signing-key rotation requires adding the new key to the authorized-issuer config in the verifier helper before any new attestations are issued).
- **Devnet use only.**

### 8.2 Mandatory migration before mainnet

Launching on mainnet with `.env`-held keys is a **release blocker**. Before the first mainnet attestation:

- Signing key → Cloud KMS (GCP KMS or AWS KMS). Both support Ed25519. Backend calls `Sign` via IAM-scoped API; key never leaves KMS.
- Data key → same KMS or Secrets Manager with strict IAM policy + audit logging.
- All signing calls logged with session id, attestation schema, subject, timestamp.

This is tracked as explicit tech debt in §13.

---

## 9. Revocation & expiry

### 9.1 Revocation paths (MVP)

| Initiator | Kinds | Flow |
|---|---|---|
| **Issuer (admin)** | any | Admin selects attestation in dashboard, provides written reason, submits. Backend builds SAS `revoke_attestation`, signs, submits. Reason persisted in DB with reviewer id + timestamp. |
| **Subject** | Identity | Auto-granted (user's right to delete their own KYC proof). Triggers the same revoke flow via user-authenticated endpoint. |
| **Subject** | Property, Ownership | Routed to admin review (to prevent self-serve hiding of disputed ownership). |
| **Auto-on-transfer** | Property, Ownership | When ownership transfers (future feature), both the old `Ownership` and the old `Property` attestation are revoked atomically with the new ones being issued. |

### 9.2 Expiry semantics

- `expires_at` is a **consumer-side check**. We do not write a cron that flips `is_valid` on expiry.
- The on-chain attestation remains discoverable post-expiry for audit; only the verifier helper (§11) treats it as invalid.

### 9.3 Forward-compatible: arbitration-triggered revocation

A future on-chain arbitration program will allow jurors to decide whether an attestation should be revoked (e.g., post-hoc discovery that a property's on-chain claim did not match reality). That program is out of scope here, but to avoid closing the door:

- The revocation flow **must be callable programmatically**, not only via admin UI. Every revoke path goes through a single backend endpoint that takes `{attestation_pubkey, reason_code, reason_evidence}` and executes the revoke tx.
- The authorized issuer set in the verifier helper is a **config parameter** (§11.3). A future arbitration program can be added as a co-issuer with revoke authority without redeploying consumers.

---

## 10. Ownership transfer

**MVP ships with no transfer flow.** Users cannot transfer property ownership on-chain; off-chain legal transfer requires support contact. This is an explicit known limitation, tracked in §13.

Design foundations for future transfer (option A: re-issue on transfer):

- **Property attestation is re-issuable per owner-era.** A property (stable `property_id_hash`) may have a sequence of `Property` attestations over its lifetime, each tied to one owner-era. This is compatible with the current schema as written.
- **Ownership history** persisted in `ownership_history` (`property_id_hash`, `owner`, `attestation_pubkey`, `active_from`, `active_to`). Current owner = the row with `active_to IS NULL`.
- **Transfer ceremony (future):** revoke old `Ownership`; re-encrypt bundle for new owner → new `doc_bundle_cid`; revoke old `Property`; issue new `Property` with new CID; issue new `Ownership` for new owner. All as one backend workflow.
- **No consumer caches.** Escrow and any other consumer must always fetch live attestations, never assume a previously seen attestation remains valid — because transfers invalidate it.

---

## 11. Verifier interface

Shipped as part of this spec so every consumer uses the same checks. Single source of correctness, versioned and auditable.

### 11.1 On-chain Rust helper

Published as an internal crate `sas_verify` (consumed by the escrow program and any future on-chain consumer):

```rust
// indicative — final signatures live in blockchain/sas_verify/src/lib.rs
pub struct VerifierConfig {
    pub authorized_issuers: Vec<Pubkey>,    // rotation / multi-issuer support
    pub identity_schema:    Pubkey,
    pub property_schema:    Pubkey,
    pub ownership_schema:   Pubkey,
}

pub struct IdentityClaim {
    pub wallet:       Pubkey,
    pub nationality:  [u8; 3],
    pub kyc_level:    u8,
    pub expires_at:   i64,
}

pub fn verify_identity<'a>(
    config:      &VerifierConfig,
    attestation: &AccountInfo<'a>,
    expected_wallet:   &Pubkey,
    min_kyc_level:     u8,
    now_unix:          i64,
) -> Result<IdentityClaim, SasVerifyError>;

pub fn verify_ownership<'a>(
    config:              &VerifierConfig,
    ownership:           &AccountInfo<'a>,
    property:            &AccountInfo<'a>,
    expected_owner:      &Pubkey,
    expected_property:   [u8; 32],
    now_unix:            i64,
) -> Result<OwnershipClaim, SasVerifyError>;
```

Each helper performs, in order: owner-program check, schema match, authorized-issuer match, not-revoked, not-expired, field decode. Errors are single-enum `SasVerifyError` (no silent returns).

### 11.2 Off-chain helpers

- **Go helper** (`backend/internal/sasverify`): same semantics, over RPC. Used by API handlers that need to gate feature access.
- **TS helper** (`frontend/src/lib/sasVerify.ts`): used by the frontend to gray-out "Sign Contract" buttons until required attestations are in place. Also surfaces human-readable error messages ("your identity attestation expires in 4 days — renew now").

### 11.3 Authorized issuers as config, not constants

`VerifierConfig.authorized_issuers` is read from on-chain config at construction time, not hardcoded. This enables:

- Issuer-key rotation without redeploying consumers.
- Adding future issuers (arbitration program, partner KYC providers with their own keys) as a governance action, not a code change.

---

## 12. Jurisdiction scope

### 12.1 MVP: Kazakhstan only

- Property intake enforces `country == "KAZ"`. Non-KAZ submissions are rejected at the API boundary.
- Identity accepts any nationality (we issue the attestation; escrow is where "landlord must be KAZ" lives, not here).

### 12.2 Extensibility

Adding a country is an **operational** task, not an architectural one:

1. Add the country's ISO code to the accept-list at intake.
2. Register the appropriate adapter (e.g., `EGovCadastralAdapter` with country-specific API credentials).
3. Update the admin review checklist template.

Schemas do not change. On-chain logic does not change. Escrow's jurisdictional rules evolve independently.

---

## 13. MVP scope summary

### 13.1 Included

- Three SAS schemas registered on devnet: `Identity`, `Property`, `Ownership`.
- One issuer: DecentraRent backend signing key.
- `ManualAdapter` for both identity and property pipelines. Admin dashboard for intake, review, approval, revocation.
- Property pipeline limited to KAZ.
- Arweave storage + AES-256-GCM encryption + X25519 key-wrap envelope for property docs.
- On-chain Rust `sas_verify` helper crate and off-chain Go/TS helpers.
- Session TTL sweep, webhook idempotency, one-session-per-(wallet, kind) rule.

### 13.2 Excluded (deferred)

- `SumSubAdapter`, `EGovKZAdapter`, `EGovCadastralAdapter`.
- Tenant on-demand document access (envelope supports adding recipients; feature not built).
- Ownership-transfer flow (foundation laid; no UI or backend workflow).
- Arbitration-triggered revocation (forward-compatible design; no arbitration program).
- Auto-renewal reminders (users re-submit identity/ownership when expired).

### 13.3 Explicit tech debt / release blockers

| Item | Where | Resolution required by |
|---|---|---|
| Signing key in `.env` | §8.1 | Before first mainnet attestation. Migrate to Cloud KMS. |
| Data key in `.env` | §8.1 | Same. |
| No audit log of signing operations | §8.1 | Follows from KMS migration (KMS logs every `Sign` call). |
| No ownership-transfer workflow | §10 | Before any user requests transfer. |

---

## 14. Open questions / future work

1. **Partial-KYC gating.** Today's design gives escrow a binary "valid identity or not" check. Should we expose `kyc_level` thresholds as a first-class contract rule (e.g., "rent > 1000 USDC requires `kyc_level >= 2`")? Belongs to escrow spec, but depends on `kyc_level` being an attestation field — already provided.
2. **Sanctions screening expiry.** `kyc_level = 2` includes sanctions screening at verification time, but sanctions lists update continuously. Do we need a separate, shorter-lived screening attestation? Deferred.
3. **Multi-issuer governance.** Who can add/remove authorized issuers? Today it's a backend config change. Eventually needs a multisig or on-chain governance action.
4. **Identity portability.** Can a user bring an attestation from an identity provider they've used elsewhere? Would require trusting external issuer keys — covered by multi-issuer extensibility, but needs separate legal/compliance review.
5. **Arweave wallet top-up monitoring.** Operational, not architectural — but needs alarms and a runbook.

---

## 15. Glossary

- **SAS** — Solana Attestation Service. The on-chain framework we use.
- **Attestation** — a signed, on-chain claim. One record per (issuer, subject, schema, fact).
- **Schema** — SAS primitive defining the shape of an attestation's fields. Registered once per network.
- **Issuer** — the authority whose key signed the attestation. DecentraRent is the sole MVP issuer.
- **Subject** — the entity an attestation is about (a wallet, or a property-anchoring PDA).
- **Facade** — our own service pattern: orchestrates sessions across adapters; does not itself verify identity or property.
- **Adapter** — integration with one verification provider (ManualAdapter, SumSubAdapter, etc.).
- **Session** — one verification attempt: one user, one kind, one provider.
- **Bundle** — tarball of a property's documents, AES-256-GCM encrypted before Arweave upload.
- **Envelope** — off-chain record of `{recipient pubkey → AES key wrapped for that recipient}`. Mutable.
- **Verifier helper** — the thin library (Rust on-chain, Go/TS off-chain) consumers use to check an attestation's validity.
