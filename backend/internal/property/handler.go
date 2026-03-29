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

type MediaCleaner interface {
	DeleteMediaForProperty(propertyID string)
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

// Create godoc
// @Summary Create a property listing
// @Description Creates a new property listing for the authenticated user
// @Tags properties
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body CreatePropertyRequest true "Property details"
// @Success 201 {object} PropertyResponse
// @Router /properties [post]
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

// List godoc
// @Summary List properties
// @Description Returns a filtered list of properties with media
// @Tags properties
// @Produce json
// @Param status query string false "Filter by status (listed, unlisted, rented)"
// @Param owner query string false "Filter by owner wallet"
// @Param token_mint query string false "Filter by token mint (SOL, USDC, USDT)"
// @Param period_type query string false "Filter by period type (hour, day, month)"
// @Param limit query int false "Limit results (default 20, max 100)"
// @Param offset query int false "Offset for pagination"
// @Success 200 {array} PropertyResponse
// @Router /properties [get]
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

// Get godoc
// @Summary Get property by ID
// @Description Returns a single property with media
// @Tags properties
// @Produce json
// @Param id path string true "Property ID"
// @Success 200 {object} PropertyResponse
// @Failure 404 {object} map[string]string
// @Router /properties/{id} [get]
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

// Update godoc
// @Summary Update a property
// @Description Updates property fields (owner only)
// @Tags properties
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Property ID"
// @Param body body UpdatePropertyRequest true "Fields to update"
// @Success 200 {object} PropertyResponse
// @Failure 403 {object} map[string]string
// @Router /properties/{id} [put]
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

// UpdateStatus godoc
// @Summary Change property status
// @Description Updates property status to listed or unlisted (owner only)
// @Tags properties
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Property ID"
// @Param body body StatusRequest true "New status"
// @Success 200 {object} PropertyResponse
// @Router /properties/{id}/status [patch]
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

// Delete godoc
// @Summary Delete a property
// @Description Deletes a property and all its media (owner only)
// @Tags properties
// @Security BearerAuth
// @Param id path string true "Property ID"
// @Success 204
// @Failure 403 {object} map[string]string
// @Router /properties/{id} [delete]
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
