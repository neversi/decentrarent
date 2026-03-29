# DecentraRent — Management API (Properties & Media)

## Context

The first module (wallet auth + chat) is complete. This module adds property listing management with media uploads. The data model is designed for future migration to Solana (UUIDs map to PDAs, prices in smallest token units). Agreements and documents are out of scope — they come next.

## Scope

- Property CRUD API
- Media upload/retrieval via MinIO (S3-compatible)
- Mock egov integration (auto-accepts verification)
- Existing JWT auth scheme used for all protected endpoints

## Database Schema

```sql
CREATE TABLE properties (
    id                  TEXT PRIMARY KEY,
    owner_wallet        TEXT NOT NULL REFERENCES users(wallet_address),
    title               TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    location            TEXT NOT NULL,
    price               BIGINT NOT NULL,
    token_mint          TEXT NOT NULL DEFAULT 'SOL',
    period_type         TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'listed',
    verification_status TEXT NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_owner ON properties(owner_wallet);
CREATE INDEX idx_properties_status ON properties(status);

CREATE TABLE property_media (
    id          TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    file_key    TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_media_property ON property_media(property_id);
```

### Field Notes

- `price`: BIGINT in smallest token unit (lamports for SOL, 6-decimal units for USDC). Maps directly to on-chain amounts.
- `token_mint`: 'SOL', 'USDC', 'USDT'. Will become a Solana mint address on-chain.
- `period_type`: 'hour', 'day', 'month'. Price is per one unit of this type.
- `status`: 'listed', 'rented', 'unlisted'. Only 'listed' properties appear in public search.
- `verification_status`: 'pending', 'verified', 'rejected'. Managed by egov integration.
- `file_key`: MinIO object key (e.g. `properties/<property_id>/<uuid>.<ext>`).

## API Endpoints

### Properties

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /properties | Create a property listing | JWT (owner) |
| GET | /properties | List properties (with filters) | Public |
| GET | /properties/{id} | Get property details + media URLs | Public |
| PUT | /properties/{id} | Update property details | JWT (owner only) |
| DELETE | /properties/{id} | Delete property + cascade media | JWT (owner only) |
| PATCH | /properties/{id}/status | Change status (list/unlist) | JWT (owner only) |

### Media

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /properties/{id}/media/upload-url | Get presigned upload URL | JWT (owner only) |
| POST | /properties/{id}/media | Register uploaded media | JWT (owner only) |
| DELETE | /properties/{id}/media/{mediaId} | Delete media item | JWT (owner only) |
| PUT | /properties/{id}/media/order | Reorder media items | JWT (owner only) |

### Request/Response Formats

**POST /properties**
```json
{
  "title": "1042 Market St",
  "description": "Modern 2BR apartment",
  "location": "San Francisco, CA",
  "price": 50000000,
  "token_mint": "SOL",
  "period_type": "day"
}
```
Response: Property object with `id`, `verification_status: "verified"` (mock auto-accepts).

**GET /properties?status=listed&owner=<wallet>&token_mint=SOL&period_type=day&limit=20&offset=0**

Response: Array of property objects. Each property includes a `media` array with presigned download URLs.

```json
{
  "id": "uuid",
  "owner_wallet": "G4XT...",
  "title": "1042 Market St",
  "description": "Modern 2BR apartment",
  "location": "San Francisco, CA",
  "price": 50000000,
  "token_mint": "SOL",
  "period_type": "day",
  "status": "listed",
  "verification_status": "verified",
  "media": [
    {
      "id": "uuid",
      "url": "http://localhost:9000/decentrarent-media/properties/uuid/file.jpg?presigned...",
      "sort_order": 0
    }
  ],
  "created_at": "2026-03-29T...",
  "updated_at": "2026-03-29T..."
}
```

**POST /properties/{id}/media/upload-url**
```json
{
  "file_name": "photo.jpg"
}
```
Response:
```json
{
  "upload_url": "http://localhost:9000/decentrarent-media/properties/uuid/uuid.jpg?presigned...",
  "file_key": "properties/uuid/uuid.jpg"
}
```

**POST /properties/{id}/media**
```json
{
  "file_key": "properties/uuid/uuid.jpg"
}
```
Response: PropertyMedia object.

**PUT /properties/{id}/media/order**
```json
{
  "order": ["media-id-1", "media-id-3", "media-id-2"]
}
```

**PATCH /properties/{id}/status**
```json
{
  "status": "unlisted"
}
```

## Media Upload Flow

1. Frontend calls `POST /properties/{id}/media/upload-url` with filename → backend generates presigned PUT URL (15 min expiry)
2. Frontend uploads file directly to MinIO using the presigned URL (no backend proxy)
3. Frontend calls `POST /properties/{id}/media` with the `file_key` → backend saves record to DB
4. On `GET /properties/{id}`, media items include presigned GET URLs (1 hour expiry)

## MinIO Docker Setup

Added to `docker-compose.yml`:

```yaml
minio:
  image: minio/minio
  ports:
    - "9000:9000"
    - "9001:9001"
  environment:
    - MINIO_ROOT_USER=decentrarent
    - MINIO_ROOT_PASSWORD=decentrarent
  volumes:
    - minio-data:/data
  command: server /data --console-address ":9001"
```

- Bucket `decentrarent-media` auto-created by backend on startup
- Presigned upload URLs: 15 minute expiry
- Presigned download URLs: 1 hour expiry
- Object key pattern: `properties/<property_id>/<uuid>.<extension>`

## Backend Structure

```
backend/internal/
├── property/
│   ├── model.go          -- Property struct
│   ├── store.go          -- Postgres CRUD queries
│   ├── handler.go        -- HTTP handlers for property endpoints
│   └── service.go        -- Business logic, calls egov on create
├── media/
│   ├── model.go          -- PropertyMedia struct
│   ├── store.go          -- DB operations for media records
│   ├── handler.go        -- Upload URL, register, delete, reorder
│   └── s3.go             -- MinIO client, presigned URL generation
└── egov/
    └── mock.go           -- Mock verification service (auto-accepts)
```

## Egov Mock

```go
type VerificationResult struct {
    Status  string // "verified", "rejected", "pending"
    Message string
}

type Verifier interface {
    Verify(location string, ownerWallet string) (*VerificationResult, error)
}

// MockVerifier always returns verified
type MockVerifier struct{}
func (m *MockVerifier) Verify(location, ownerWallet string) (*VerificationResult, error) {
    return &VerificationResult{Status: "verified", Message: "mock: auto-accepted"}, nil
}
```

When real egov integration is built, implement the same `Verifier` interface. No other code changes needed.

## Auth

Uses existing JWT auth middleware from `backend/internal/auth/middleware.go`. Wallet address extracted via `middleware.GetWalletAddress(ctx)`.

Owner-only endpoints verify `property.owner_wallet == authenticated wallet` before allowing mutations.

Public endpoints (`GET /properties`, `GET /properties/{id}`) do not require auth.

## Verification

1. Create a property via `POST /properties` → returns property with `verification_status: "verified"`
2. List properties via `GET /properties` → returns array with the created property
3. Get property by ID → includes empty media array
4. Upload media: get presigned URL → upload to MinIO → register media → GET property now includes media with download URL
5. Update property → fields change
6. Change status to unlisted → property no longer appears in public listing
7. Delete property → property and media records removed, MinIO objects deleted
