package order

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	mw "github.com/abdro/decentrarent/backend/internal/middleware"
)

// PriceProvider returns the current SOL price in USDT.
type PriceProvider interface {
	GetPrice() (float64, time.Time)
}

type Handler struct {
	store   *Store
	service *Service
	price   PriceProvider
}

func NewHandler(store *Store, service *Service, price PriceProvider) *Handler {
	return &Handler{store: store, service: service, price: price}
}

// OrderWithUSDT extends Order with USDT-converted amounts.
type OrderWithUSDT struct {
	Order
	RentAmountUSDT    float64 `json:"rent_amount_usdt"`
	DepositAmountUSDT float64 `json:"deposit_amount_usdt"`
}

// OrdersListResponse wraps the order list with SOL price metadata.
type OrdersListResponse struct {
	Orders      []OrderWithUSDT `json:"orders"`
	SolPriceUSD float64         `json:"sol_price_usdt"`
	PriceAt     string          `json:"price_updated_at"`
}

func lamportsToSOL(lamports int64) float64 {
	return float64(lamports) / 1_000_000_000
}

func roundUSDT(v float64) float64 {
	return math.Round(v*100) / 100
}

// ─── Create godoc ───────────────────────────────────────────────────
// @Summary Create an order (escrow)
// @Description Tenant creates a new rental order. Escrow starts in awaiting_signatures status.
// @Tags orders
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body CreateOrderRequest true "Order details"
// @Success 201 {object} Order
// @Failure 400 {object} map[string]string
// @Router /orders [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	o, err := h.service.CreateOrder(userID, &req)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(o)
}

// ─── List godoc ─────────────────────────────────────────────────────
// @Summary List orders for the authenticated user
// @Description Returns orders where user is tenant or landlord
// @Tags orders
// @Security BearerAuth
// @Produce json
// @Param status query string false "Filter by escrow_status"
// @Param property_id query string false "Filter by property_id"
// @Param role query string false "Filter by role: tenant, landlord, or all (default all)"
// @Param limit query int false "Limit (default 20, max 100)"
// @Param offset query int false "Offset for pagination"
// @Success 200 {array} Order
// @Router /orders [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

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
		PropertyID:     q.Get("property_id"),
		ConversationID: q.Get("conversation_id"),
		EscrowStatus:   q.Get("status"),
		Limit:          limit,
		Offset:         offset,
	}

	orders, err := h.store.List(filter)
	if err != nil {
		log.Printf("[orders] List error: %v", err)
		http.Error(w, `{"error":"failed to list orders"}`, http.StatusInternalServerError)
		return
	}
	if orders == nil {
		orders = []Order{}
	}

	solPrice, priceAt := h.price.GetPrice()

	enriched := make([]OrderWithUSDT, len(orders))
	for i, o := range orders {
		rentSOL := lamportsToSOL(o.RentAmount)
		depSOL := lamportsToSOL(o.DepositAmount)
		enriched[i] = OrderWithUSDT{
			Order:             o,
			RentAmountUSDT:    roundUSDT(rentSOL * solPrice),
			DepositAmountUSDT: roundUSDT(depSOL * solPrice),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(OrdersListResponse{
		Orders:      enriched,
		SolPriceUSD: solPrice,
		PriceAt:     priceAt.UTC().Format("2006-01-02T15:04:05Z"),
	})
}

// ─── Get godoc ──────────────────────────────────────────────────────
// @Summary Get order by ID
// @Description Returns a single order with full details
// @Tags orders
// @Security BearerAuth
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {object} Order
// @Failure 404 {object} map[string]string
// @Router /orders/{id} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"order not found"}`, http.StatusNotFound)
		return
	}

	if o.TenantID != userID && o.LandlordID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(o)
}

// ─── GetPayments godoc ──────────────────────────────────────────────
// @Summary Get rent payments for an order
// @Description Returns all rent payments for the given order
// @Tags orders
// @Security BearerAuth
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {array} RentPayment
// @Router /orders/{id}/payments [get]
func (h *Handler) GetPayments(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"order not found"}`, http.StatusNotFound)
		return
	}
	if o.TenantID != userID && o.LandlordID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	payments, err := h.store.GetRentPayments(id)
	if err != nil {
		http.Error(w, `{"error":"failed to get payments"}`, http.StatusInternalServerError)
		return
	}
	if payments == nil {
		payments = []RentPayment{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payments)
}

// ─── Accept godoc ──────────────────────────────────────────────────
// @Summary Accept an order proposal
// @Tags orders
// @Security BearerAuth
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {object} Order
// @Router /orders/{id}/accept [post]
func (h *Handler) Accept(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.service.AcceptOrder(id, userID)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrForbidden {
			status = http.StatusForbidden
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(o)
}

// ─── Reject godoc ──────────────────────────────────────────────────
// @Summary Reject an order proposal
// @Tags orders
// @Security BearerAuth
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {object} Order
// @Router /orders/{id}/reject [post]
func (h *Handler) Reject(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.service.RejectOrder(id, userID)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrForbidden {
			status = http.StatusForbidden
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(o)
}

// ─── OpenDispute godoc ─────────────────────────────────────────────
// @Summary Open a dispute for an active order
// @Description Calls the on-chain open_dispute instruction. Status transitions to 'disputed' after the Solana event is received.
// @Tags orders
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param body body DisputeRequest true "Dispute reason"
// @Success 202 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /orders/{id}/dispute [post]
func (h *Handler) OpenDispute(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	var req DisputeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Reason == "" {
		http.Error(w, `{"error":"dispute reason cannot be empty"}`, http.StatusBadRequest)
		return
	}

	_, err := h.service.OpenDispute(id, userID, req.Reason)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrForbidden {
			status = http.StatusForbidden
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte(`{"status":"dispute_submitted"}`))
}

// ─── ListDisputed godoc (admin) ─────────────────────────────────────
// @Summary List all disputed orders (admin only)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param limit query int false "Limit (default 50)"
// @Param offset query int false "Offset"
// @Success 200 {array} Order
// @Failure 403 {object} map[string]string
// @Router /admin/orders/disputed [get]
func (h *Handler) ListDisputed(w http.ResponseWriter, r *http.Request) {
	if !mw.GetIsAdmin(r.Context()) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	q := r.URL.Query()
	limit := 50
	if l := q.Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}
	offset := 0
	if o := q.Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	orders, err := h.store.ListDisputed(limit, offset)
	if err != nil {
		http.Error(w, `{"error":"failed to list disputed orders"}`, http.StatusInternalServerError)
		return
	}
	if orders == nil {
		orders = []Order{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orders)
}

// ─── ResolveDispute godoc (admin) ───────────────────────────────────
// @Summary Resolve a disputed order (admin only)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param body body ResolveDisputeRequest true "winner (tenant|landlord) and reason"
// @Success 202 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /admin/orders/{id}/resolve [post]
func (h *Handler) ResolveDispute(w http.ResponseWriter, r *http.Request) {
	if !mw.GetIsAdmin(r.Context()) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")

	var req ResolveDisputeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	_, err := h.service.ResolveDispute(id, req.Winner, req.Reason)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrForbidden {
			status = http.StatusForbidden
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte(`{"status":"resolve_submitted"}`))
}

// ─── GetHistory godoc ───────────────────────────────────────────────
// @Summary Get status history for an order
// @Description Returns the full status transition history
// @Tags orders
// @Security BearerAuth
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {array} StatusHistory
// @Router /orders/{id}/history [get]
func (h *Handler) GetHistory(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"order not found"}`, http.StatusNotFound)
		return
	}
	if o.TenantID != userID && o.LandlordID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	history, err := h.store.GetHistory(id)
	if err != nil {
		http.Error(w, `{"error":"failed to get history"}`, http.StatusInternalServerError)
		return
	}
	if history == nil {
		history = []StatusHistory{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}
