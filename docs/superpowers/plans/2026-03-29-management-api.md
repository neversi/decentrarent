# Management API (Properties & Media) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add property CRUD API with media uploads via MinIO to the existing DecentraRent Go backend.

**Architecture:** Extends the existing Chi router backend with three new packages (property, media, egov). MinIO container added to Docker Compose for S3-compatible media storage. Mock egov auto-accepts property verification. Public endpoints for listing, JWT-protected endpoints for mutations.

**Tech Stack:** Go (Chi router, existing auth middleware), PostgreSQL, MinIO (S3-compatible), `github.com/minio/minio-go/v7`

---

## File Structure

```
backend/internal/
├── egov/
│   └── mock.go                -- Verifier interface + MockVerifier
├── property/
│   ├── model.go               -- Property struct
│   ├── store.go               -- Postgres CRUD + Migrate()
│   ├── service.go             -- Business logic (create with egov, ownership checks)
│   └── handler.go             -- HTTP handlers for /properties endpoints
├── media/
│   ├── model.go               -- PropertyMedia struct + MediaResponse
│   ├── store.go               -- Postgres CRUD for media records
│   ├── s3.go                  -- MinIO client init + presigned URL helpers
│   └── handler.go             -- HTTP handlers for media endpoints

Modified:
├── cmd/server/main.go         -- Wire new stores/services/handlers, add routes
├── config/config.go           -- Add MinIO config fields

docker-compose.yml             -- Add minio service + volume
docker-compose.dev.yml         -- Add minio volume mount
```

---

### Task 1: Docker — Add MinIO Service

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `backend/internal/config/config.go`

- [ ] **Step 1: Add MinIO service to docker-compose.yml**

Add after the `db` service, before the `volumes` section:

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
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Add `minio-data:` to the `volumes:` section alongside `pgdata:`.

Add env vars to the `backend` service:

```yaml
      - MINIO_ENDPOINT=minio:9000
      - MINIO_PUBLIC_ENDPOINT=localhost:9000
      - MINIO_ACCESS_KEY=decentrarent
      - MINIO_SECRET_KEY=decentrarent
      - MINIO_BUCKET=decentrarent-media
      - MINIO_USE_SSL=false
```

- [ ] **Step 2: Add MinIO config fields to config.go**

```go
type Config struct {
	DatabaseURL         string
	JWTSecret           string
	CentrifugoKey       string
	CentrifugoURL       string
	ServerPort          string
	MinioEndpoint       string
	MinioPublicEndpoint string
	MinioAccessKey      string
	MinioSecretKey      string
	MinioBucket         string
	MinioUseSSL         bool
}
```

Add to `Load()`:

```go
MinioEndpoint:       getEnv("MINIO_ENDPOINT", "localhost:9000"),
MinioPublicEndpoint: getEnv("MINIO_PUBLIC_ENDPOINT", "localhost:9000"),
MinioAccessKey: getEnv("MINIO_ACCESS_KEY", "decentrarent"),
MinioSecretKey: getEnv("MINIO_SECRET_KEY", "decentrarent"),
MinioBucket:    getEnv("MINIO_BUCKET", "decentrarent-media"),
MinioUseSSL:    getEnv("MINIO_USE_SSL", "false") == "true",
```

- [ ] **Step 3: Verify MinIO starts**

```bash
docker compose down && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose ps  # All 5 services should be running
curl -s http://localhost:9000/minio/health/live  # Should return 200
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml backend/internal/config/config.go
git commit -m "feat: add MinIO service for media storage"
```

---

### Task 2: Egov Mock

**Files:**
- Create: `backend/internal/egov/mock.go`

- [ ] **Step 1: Create egov package with Verifier interface and mock**

```go
package egov

type VerificationResult struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

type Verifier interface {
	Verify(location string, ownerWallet string) (*VerificationResult, error)
}

type MockVerifier struct{}

func NewMockVerifier() *MockVerifier {
	return &MockVerifier{}
}

func (m *MockVerifier) Verify(location, ownerWallet string) (*VerificationResult, error) {
	return &VerificationResult{
		Status:  "verified",
		Message: "mock: auto-accepted",
	}, nil
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./... 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/egov/mock.go
git commit -m "feat: add egov mock verifier interface"
```

---

### Task 3: Property Model & Store

**Files:**
- Create: `backend/internal/property/model.go`
- Create: `backend/internal/property/store.go`

- [ ] **Step 1: Create property model**

```go
package property

import "time"

type Property struct {
	ID                 string    `json:"id"`
	OwnerWallet        string    `json:"owner_wallet"`
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	Location           string    `json:"location"`
	Price              int64     `json:"price"`
	TokenMint          string    `json:"token_mint"`
	PeriodType         string    `json:"period_type"`
	Status             string    `json:"status"`
	VerificationStatus string    `json:"verification_status"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type CreatePropertyRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Location    string `json:"location"`
	Price       int64  `json:"price"`
	TokenMint   string `json:"token_mint"`
	PeriodType  string `json:"period_type"`
}

type UpdatePropertyRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Location    *string `json:"location"`
	Price       *int64  `json:"price"`
	TokenMint   *string `json:"token_mint"`
	PeriodType  *string `json:"period_type"`
}

type StatusRequest struct {
	Status string `json:"status"`
}

type ListFilter struct {
	Status     string
	Owner      string
	TokenMint  string
	PeriodType string
	Limit      int
	Offset     int
}
```

- [ ] **Step 2: Create property store**

```go
package property

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS properties (
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
		)`,
		`CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_wallet)`,
		`CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Create(ownerWallet string, req *CreatePropertyRequest, verificationStatus string) (*Property, error) {
	p := &Property{
		ID:                 uuid.New().String(),
		OwnerWallet:        ownerWallet,
		Title:              req.Title,
		Description:        req.Description,
		Location:           req.Location,
		Price:              req.Price,
		TokenMint:          req.TokenMint,
		PeriodType:         req.PeriodType,
		Status:             "listed",
		VerificationStatus: verificationStatus,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	_, err := s.db.Exec(
		`INSERT INTO properties (id, owner_wallet, title, description, location, price, token_mint, period_type, status, verification_status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		p.ID, p.OwnerWallet, p.Title, p.Description, p.Location, p.Price, p.TokenMint, p.PeriodType, p.Status, p.VerificationStatus, p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Store) GetByID(id string) (*Property, error) {
	p := &Property{}
	err := s.db.QueryRow(
		`SELECT id, owner_wallet, title, description, location, price, token_mint, period_type, status, verification_status, created_at, updated_at
		 FROM properties WHERE id = $1`, id,
	).Scan(&p.ID, &p.OwnerWallet, &p.Title, &p.Description, &p.Location, &p.Price, &p.TokenMint, &p.PeriodType, &p.Status, &p.VerificationStatus, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Store) List(f *ListFilter) ([]Property, error) {
	query := `SELECT id, owner_wallet, title, description, location, price, token_mint, period_type, status, verification_status, created_at, updated_at FROM properties WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if f.Status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, f.Status)
		argIdx++
	}
	if f.Owner != "" {
		query += fmt.Sprintf(" AND owner_wallet = $%d", argIdx)
		args = append(args, f.Owner)
		argIdx++
	}
	if f.TokenMint != "" {
		query += fmt.Sprintf(" AND token_mint = $%d", argIdx)
		args = append(args, f.TokenMint)
		argIdx++
	}
	if f.PeriodType != "" {
		query += fmt.Sprintf(" AND period_type = $%d", argIdx)
		args = append(args, f.PeriodType)
		argIdx++
	}

	query += " ORDER BY created_at DESC"

	if f.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIdx)
		args = append(args, f.Limit)
		argIdx++
	}
	if f.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argIdx)
		args = append(args, f.Offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var props []Property
	for rows.Next() {
		var p Property
		if err := rows.Scan(&p.ID, &p.OwnerWallet, &p.Title, &p.Description, &p.Location, &p.Price, &p.TokenMint, &p.PeriodType, &p.Status, &p.VerificationStatus, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		props = append(props, p)
	}
	return props, nil
}

func (s *Store) Update(id string, req *UpdatePropertyRequest) (*Property, error) {
	sets := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, *req.Title)
		argIdx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Location != nil {
		sets = append(sets, fmt.Sprintf("location = $%d", argIdx))
		args = append(args, *req.Location)
		argIdx++
	}
	if req.Price != nil {
		sets = append(sets, fmt.Sprintf("price = $%d", argIdx))
		args = append(args, *req.Price)
		argIdx++
	}
	if req.TokenMint != nil {
		sets = append(sets, fmt.Sprintf("token_mint = $%d", argIdx))
		args = append(args, *req.TokenMint)
		argIdx++
	}
	if req.PeriodType != nil {
		sets = append(sets, fmt.Sprintf("period_type = $%d", argIdx))
		args = append(args, *req.PeriodType)
		argIdx++
	}

	if len(sets) == 0 {
		return s.GetByID(id)
	}

	sets = append(sets, fmt.Sprintf("updated_at = $%d", argIdx))
	args = append(args, time.Now())
	argIdx++

	args = append(args, id)
	query := fmt.Sprintf("UPDATE properties SET %s WHERE id = $%d", strings.Join(sets, ", "), argIdx)

	_, err := s.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}
	return s.GetByID(id)
}

func (s *Store) UpdateStatus(id, status string) error {
	_, err := s.db.Exec(
		`UPDATE properties SET status = $1, updated_at = $2 WHERE id = $3`,
		status, time.Now(), id,
	)
	return err
}

func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM properties WHERE id = $1`, id)
	return err
}
```

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./... 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add backend/internal/property/
git commit -m "feat: add property model and store with CRUD operations"
```

---

### Task 4: Property Service & Handler

**Files:**
- Create: `backend/internal/property/service.go`
- Create: `backend/internal/property/handler.go`

- [ ] **Step 1: Create property service**

```go
package property

import "github.com/abdro/decentrarent/backend/internal/egov"

type Service struct {
	store    *Store
	verifier egov.Verifier
}

func NewService(store *Store, verifier egov.Verifier) *Service {
	return &Service{store: store, verifier: verifier}
}

func (s *Service) CreateProperty(ownerWallet string, req *CreatePropertyRequest) (*Property, error) {
	result, err := s.verifier.Verify(req.Location, ownerWallet)
	if err != nil {
		return nil, err
	}
	return s.store.Create(ownerWallet, req, result.Status)
}
```

- [ ] **Step 2: Create property handler**

Note: The handler uses a `MediaEnricher` interface to include media with presigned URLs in property responses, avoiding a direct import cycle with the media package.

```go
package property

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	mw "github.com/abdro/decentrarent/backend/internal/middleware"
)

type MediaEnricher interface {
	GetMediaForProperty(propertyID string) []map[string]interface{}
}

type Handler struct {
	store    *Store
	service  *Service
	enricher MediaEnricher
	cleaner  MediaCleaner
}

func NewHandler(store *Store, service *Service, enricher MediaEnricher, cleaner MediaCleaner) *Handler {
	return &Handler{store: store, service: service, enricher: enricher, cleaner: cleaner}
}

type PropertyResponse struct {
	Property
	Media []map[string]interface{} `json:"media"`
}

func (h *Handler) enrich(p *Property) PropertyResponse {
	media := h.enricher.GetMediaForProperty(p.ID)
	if media == nil {
		media = []map[string]interface{}{}
	}
	return PropertyResponse{Property: *p, Media: media}
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	if wallet == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreatePropertyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Title == "" || req.Location == "" || req.Price <= 0 || req.PeriodType == "" {
		http.Error(w, `{"error":"title, location, price, and period_type are required"}`, http.StatusBadRequest)
		return
	}

	if req.TokenMint == "" {
		req.TokenMint = "SOL"
	}

	p, err := h.service.CreateProperty(wallet, &req)
	if err != nil {
		http.Error(w, `{"error":"failed to create property"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(h.enrich(p))
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 20
	if l := q.Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	offset := 0
	if o := q.Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	filter := &ListFilter{
		Status:     q.Get("status"),
		Owner:      q.Get("owner"),
		TokenMint:  q.Get("token_mint"),
		PeriodType: q.Get("period_type"),
		Limit:      limit,
		Offset:     offset,
	}

	// Default to listed for public queries
	if filter.Status == "" && filter.Owner == "" {
		filter.Status = "listed"
	}

	props, err := h.store.List(filter)
	if err != nil {
		http.Error(w, `{"error":"failed to list properties"}`, http.StatusInternalServerError)
		return
	}

	if props == nil {
		props = []Property{}
	}

	result := make([]PropertyResponse, 0, len(props))
	for i := range props {
		result = append(result, h.enrich(&props[i]))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	p, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.enrich(p))
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	id := chi.URLParam(r, "id")

	p, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req UpdatePropertyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	updated, err := h.store.Update(id, &req)
	if err != nil {
		http.Error(w, `{"error":"failed to update property"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.enrich(updated))
}

func (h *Handler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	id := chi.URLParam(r, "id")

	p, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req StatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Status != "listed" && req.Status != "unlisted" {
		http.Error(w, `{"error":"status must be 'listed' or 'unlisted'"}`, http.StatusBadRequest)
		return
	}

	if err := h.store.UpdateStatus(id, req.Status); err != nil {
		http.Error(w, `{"error":"failed to update status"}`, http.StatusInternalServerError)
		return
	}

	updated, _ := h.store.GetByID(id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.enrich(updated))
}

type MediaCleaner interface {
	DeleteMediaForProperty(propertyID string)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	id := chi.URLParam(r, "id")

	p, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	// Delete S3 objects before DB cascade removes records
	if h.cleaner != nil {
		h.cleaner.DeleteMediaForProperty(id)
	}

	if err := h.store.Delete(id); err != nil {
		http.Error(w, `{"error":"failed to delete property"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./... 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add backend/internal/property/
git commit -m "feat: add property service and HTTP handlers"
```

---

### Task 5: Media Model, Store & S3 Client

**Files:**
- Create: `backend/internal/media/model.go`
- Create: `backend/internal/media/store.go`
- Create: `backend/internal/media/s3.go`

- [ ] **Step 1: Install MinIO Go SDK**

```bash
cd backend && go get github.com/minio/minio-go/v7
```

- [ ] **Step 2: Create media model**

```go
package media

import "time"

type PropertyMedia struct {
	ID         string    `json:"id"`
	PropertyID string    `json:"property_id"`
	FileKey    string    `json:"file_key"`
	SortOrder  int       `json:"sort_order"`
	CreatedAt  time.Time `json:"created_at"`
}

type MediaResponse struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	SortOrder int    `json:"sort_order"`
}

type UploadURLRequest struct {
	FileName string `json:"file_name"`
}

type UploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	FileKey   string `json:"file_key"`
}

type RegisterMediaRequest struct {
	FileKey string `json:"file_key"`
}

type ReorderRequest struct {
	Order []string `json:"order"`
}
```

- [ ] **Step 3: Create media store**

```go
package media

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS property_media (
			id          TEXT PRIMARY KEY,
			property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
			file_key    TEXT NOT NULL,
			sort_order  INT NOT NULL DEFAULT 0,
			created_at  TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_property_media_property ON property_media(property_id)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Create(propertyID, fileKey string) (*PropertyMedia, error) {
	// Get next sort order
	var maxOrder int
	err := s.db.QueryRow(
		`SELECT COALESCE(MAX(sort_order), -1) FROM property_media WHERE property_id = $1`,
		propertyID,
	).Scan(&maxOrder)
	if err != nil {
		return nil, err
	}

	m := &PropertyMedia{
		ID:         uuid.New().String(),
		PropertyID: propertyID,
		FileKey:    fileKey,
		SortOrder:  maxOrder + 1,
		CreatedAt:  time.Now(),
	}

	_, err = s.db.Exec(
		`INSERT INTO property_media (id, property_id, file_key, sort_order, created_at) VALUES ($1, $2, $3, $4, $5)`,
		m.ID, m.PropertyID, m.FileKey, m.SortOrder, m.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) ListByProperty(propertyID string) ([]PropertyMedia, error) {
	rows, err := s.db.Query(
		`SELECT id, property_id, file_key, sort_order, created_at FROM property_media WHERE property_id = $1 ORDER BY sort_order`,
		propertyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []PropertyMedia
	for rows.Next() {
		var m PropertyMedia
		if err := rows.Scan(&m.ID, &m.PropertyID, &m.FileKey, &m.SortOrder, &m.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	return items, nil
}

func (s *Store) Delete(id string) (*PropertyMedia, error) {
	m := &PropertyMedia{}
	err := s.db.QueryRow(
		`SELECT id, property_id, file_key, sort_order, created_at FROM property_media WHERE id = $1`, id,
	).Scan(&m.ID, &m.PropertyID, &m.FileKey, &m.SortOrder, &m.CreatedAt)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(`DELETE FROM property_media WHERE id = $1`, id)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) Reorder(propertyID string, order []string) error {
	for i, id := range order {
		_, err := s.db.Exec(
			`UPDATE property_media SET sort_order = $1 WHERE id = $2 AND property_id = $3`,
			i, id, propertyID,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) DeleteByProperty(propertyID string) ([]PropertyMedia, error) {
	items, err := s.ListByProperty(propertyID)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Exec(`DELETE FROM property_media WHERE property_id = $1`, propertyID)
	if err != nil {
		return nil, err
	}
	return items, nil
}
```

- [ ] **Step 4: Create S3 client**

```go
package media

import (
	"context"
	"fmt"
	"net/url"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type S3Client struct {
	client         *minio.Client
	publicClient   *minio.Client
	bucket         string
}

func NewS3Client(endpoint, publicEndpoint, accessKey, secretKey, bucket string, useSSL bool) (*S3Client, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}

	// Separate client for presigned URLs (uses public-facing hostname)
	publicClient, err := minio.New(publicEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}

	// Auto-create bucket
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}

	return &S3Client{client: client, publicClient: publicClient, bucket: bucket}, nil
}

func (s *S3Client) GenerateUploadURL(propertyID, fileName string) (uploadURL, fileKey string, err error) {
	ext := filepath.Ext(fileName)
	fileKey = fmt.Sprintf("properties/%s/%s%s", propertyID, uuid.New().String(), ext)

	presignedURL, err := s.publicClient.PresignedPutObject(context.Background(), s.bucket, fileKey, 15*time.Minute)
	if err != nil {
		return "", "", err
	}

	return presignedURL.String(), fileKey, nil
}

func (s *S3Client) GenerateDownloadURL(fileKey string) (string, error) {
	reqParams := make(url.Values)
	presignedURL, err := s.publicClient.PresignedGetObject(context.Background(), s.bucket, fileKey, 1*time.Hour, reqParams)
	if err != nil {
		return "", err
	}
	return presignedURL.String(), nil
}

func (s *S3Client) DeleteObject(fileKey string) error {
	return s.client.RemoveObject(context.Background(), s.bucket, fileKey, minio.RemoveObjectOptions{})
}
```

- [ ] **Step 5: Verify build**

```bash
cd backend && go mod tidy && go build ./... 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add backend/internal/media/ backend/go.mod backend/go.sum
git commit -m "feat: add media model, store, and S3 client"
```

---

### Task 6: Media Handler

**Files:**
- Create: `backend/internal/media/handler.go`

- [ ] **Step 1: Create media handler**

```go
package media

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	mw "github.com/abdro/decentrarent/backend/internal/middleware"
	"github.com/abdro/decentrarent/backend/internal/property"
)

type Handler struct {
	store         *Store
	s3            *S3Client
	propertyStore *property.Store
}

func NewHandler(store *Store, s3 *S3Client, propertyStore *property.Store) *Handler {
	return &Handler{store: store, s3: s3, propertyStore: propertyStore}
}

func (h *Handler) checkOwner(r *http.Request) (*property.Property, string, error) {
	wallet := mw.GetWalletAddress(r.Context())
	propertyID := chi.URLParam(r, "id")
	p, err := h.propertyStore.GetByID(propertyID)
	if err != nil {
		return nil, wallet, err
	}
	return p, wallet, nil
}

func (h *Handler) GetUploadURL(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req UploadURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileName == "" {
		http.Error(w, `{"error":"file_name is required"}`, http.StatusBadRequest)
		return
	}

	uploadURL, fileKey, err := h.s3.GenerateUploadURL(p.ID, req.FileName)
	if err != nil {
		http.Error(w, `{"error":"failed to generate upload URL"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(UploadURLResponse{
		UploadURL: uploadURL,
		FileKey:   fileKey,
	})
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req RegisterMediaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileKey == "" {
		http.Error(w, `{"error":"file_key is required"}`, http.StatusBadRequest)
		return
	}

	m, err := h.store.Create(p.ID, req.FileKey)
	if err != nil {
		http.Error(w, `{"error":"failed to register media"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(m)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	mediaID := chi.URLParam(r, "mediaId")
	m, err := h.store.Delete(mediaID)
	if err != nil {
		http.Error(w, `{"error":"media not found"}`, http.StatusNotFound)
		return
	}

	_ = h.s3.DeleteObject(m.FileKey)

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Reorder(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req ReorderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Order) == 0 {
		http.Error(w, `{"error":"order array is required"}`, http.StatusBadRequest)
		return
	}

	if err := h.store.Reorder(p.ID, req.Order); err != nil {
		http.Error(w, `{"error":"failed to reorder media"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetMediaForProperty returns media with presigned download URLs for a property.
// Returns []map[string]interface{} to satisfy property.MediaEnricher interface without import cycle.
func (h *Handler) GetMediaForProperty(propertyID string) []map[string]interface{} {
	items, err := h.store.ListByProperty(propertyID)
	if err != nil || items == nil {
		return []map[string]interface{}{}
	}

	result := make([]map[string]interface{}, 0, len(items))
	for _, m := range items {
		url, err := h.s3.GenerateDownloadURL(m.FileKey)
		if err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"id":         m.ID,
			"url":        url,
			"sort_order": m.SortOrder,
		})
	}
	return result
}

// DeleteMediaForProperty deletes all S3 objects for a property.
// Satisfies property.MediaCleaner interface.
func (h *Handler) DeleteMediaForProperty(propertyID string) {
	items, err := h.store.DeleteByProperty(propertyID)
	if err != nil {
		return
	}
	for _, m := range items {
		_ = h.s3.DeleteObject(m.FileKey)
	}
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./... 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/media/handler.go
git commit -m "feat: add media HTTP handlers with presigned URL flow"
```

---

### Task 7: Wire Everything in main.go

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Update main.go to wire property and media**

Replace the full content of `backend/cmd/server/main.go`:

```go
package main

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	_ "github.com/lib/pq"

	"github.com/abdro/decentrarent/backend/internal/auth"
	"github.com/abdro/decentrarent/backend/internal/chat"
	"github.com/abdro/decentrarent/backend/internal/config"
	"github.com/abdro/decentrarent/backend/internal/egov"
	"github.com/abdro/decentrarent/backend/internal/media"
	"github.com/abdro/decentrarent/backend/internal/property"
	"github.com/abdro/decentrarent/backend/internal/user"
)

func main() {
	cfg := config.Load()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Connected to database")

	// Stores
	userStore := user.NewStore(db)
	if err := userStore.Migrate(); err != nil {
		log.Fatalf("Failed to run user migrations: %v", err)
	}

	chatStore := chat.NewStore(db)
	if err := chatStore.Migrate(); err != nil {
		log.Fatalf("Failed to run chat migrations: %v", err)
	}

	propertyStore := property.NewStore(db)
	if err := propertyStore.Migrate(); err != nil {
		log.Fatalf("Failed to run property migrations: %v", err)
	}

	mediaStore := media.NewStore(db)
	if err := mediaStore.Migrate(); err != nil {
		log.Fatalf("Failed to run media migrations: %v", err)
	}

	// S3 client
	s3Client, err := media.NewS3Client(cfg.MinioEndpoint, cfg.MinioPublicEndpoint, cfg.MinioAccessKey, cfg.MinioSecretKey, cfg.MinioBucket, cfg.MinioUseSSL)
	if err != nil {
		log.Fatalf("Failed to connect to MinIO: %v", err)
	}
	log.Println("Connected to MinIO")

	// Services
	authService := auth.NewService(cfg.JWTSecret)
	chatService := chat.NewService(chatStore)
	verifier := egov.NewMockVerifier()
	propertyService := property.NewService(propertyStore, verifier)

	// Handlers
	authHandler := auth.NewHandler(authService, userStore)
	userHandler := user.NewHandler(userStore)
	chatHandler := chat.NewHandler(chatStore)
	centrifugoHandler := chat.NewCentrifugoHandler(authService, chatService)
	mediaHandler := media.NewHandler(mediaStore, s3Client, propertyStore)
	propertyHandler := property.NewHandler(propertyStore, propertyService, mediaHandler, mediaHandler)

	// Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	// Auth routes (public)
	r.Get("/auth/nonce", authHandler.GetNonce)
	r.Post("/auth/verify", authHandler.Verify)

	// Centrifugo proxy endpoints
	r.Post("/centrifugo/connect", centrifugoHandler.Connect)
	r.Post("/centrifugo/subscribe", centrifugoHandler.Subscribe)
	r.Post("/centrifugo/publish", centrifugoHandler.Publish)

	// Public property routes
	r.Get("/properties", propertyHandler.List)
	r.Get("/properties/{id}", propertyHandler.Get)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authService.AuthMiddleware)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Get("/user/me", userHandler.GetMe)

		// Chat
		r.Get("/conversations", chatHandler.ListConversations)
		r.Get("/conversations/{id}/messages", chatHandler.GetMessages)
		r.Post("/conversations/messages", chatHandler.SendMessage)
		r.Post("/dev/seed-chat", chatHandler.SeedChat)

		// Properties (owner actions)
		r.Post("/properties", propertyHandler.Create)
		r.Put("/properties/{id}", propertyHandler.Update)
		r.Delete("/properties/{id}", propertyHandler.Delete)
		r.Patch("/properties/{id}/status", propertyHandler.UpdateStatus)

		// Media
		r.Post("/properties/{id}/media/upload-url", mediaHandler.GetUploadURL)
		r.Post("/properties/{id}/media", mediaHandler.Register)
		r.Delete("/properties/{id}/media/{mediaId}", mediaHandler.Delete)
		r.Put("/properties/{id}/media/order", mediaHandler.Reorder)
	})

	log.Printf("Server starting on :%s", cfg.ServerPort)
	log.Fatal(http.ListenAndServe(":"+cfg.ServerPort, r))
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && go mod tidy && go build ./cmd/server 2>&1
```

- [ ] **Step 3: Restart services and verify**

```bash
docker compose down && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
sleep 5 && docker compose ps  # All 5 services running
curl -s http://localhost:8080/health  # "ok"
curl -s http://localhost:8080/properties  # "[]"
```

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/server/main.go backend/go.mod backend/go.sum
git commit -m "feat: wire property and media routes into server"
```

---

### Task 8: Integration Test via curl

- [ ] **Step 1: End-to-end test with curl**

This requires a valid JWT. Sign in via the browser first, then copy the token from browser DevTools (Network tab → auth/verify response → token field). Set it as an env var:

```bash
export TOKEN="<your-jwt-here>"
```

Create a property:
```bash
curl -s -X POST http://localhost:8080/properties \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Beach House","description":"Oceanfront property","location":"Malibu, CA","price":100000000,"token_mint":"SOL","period_type":"day"}' | jq .
```
Expected: Property object with `verification_status: "verified"`.

List properties:
```bash
curl -s http://localhost:8080/properties | jq .
```
Expected: Array with the created property.

Get upload URL:
```bash
export PROP_ID="<id-from-create-response>"
curl -s -X POST "http://localhost:8080/properties/$PROP_ID/media/upload-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file_name":"photo.jpg"}' | jq .
```
Expected: `upload_url` and `file_key`.

Upload a test file to MinIO:
```bash
export UPLOAD_URL="<upload_url-from-response>"
curl -X PUT "$UPLOAD_URL" -H "Content-Type: image/jpeg" --data-binary @/path/to/any/image.jpg
```

Register the media:
```bash
export FILE_KEY="<file_key-from-response>"
curl -s -X POST "http://localhost:8080/properties/$PROP_ID/media" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"file_key\":\"$FILE_KEY\"}" | jq .
```

Update status to unlisted:
```bash
curl -s -X PATCH "http://localhost:8080/properties/$PROP_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"unlisted"}' | jq .
```
Expected: Property with `status: "unlisted"`.

List again — should be empty (unlisted filtered out):
```bash
curl -s http://localhost:8080/properties | jq .
```
Expected: `[]`

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "fix: integration test fixes" || echo "No fixes needed"
```
