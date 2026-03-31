package order

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	mw "github.com/abdro/decentrarent/backend/internal/middleware"
)

type Handler struct {
	store   *Store
	service *Service
}

func NewHandler(store *Store, service *Service) *Handler {
	return &Handler{store: store, service: service}
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
		http.Error(w, `{"error":"failed to list orders"}`, http.StatusInternalServerError)
		return
	}
	if orders == nil {
		orders = []Order{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orders)
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

// ─── Sign godoc ─────────────────────────────────────────────────────
// @Summary Sign an order
// @Description Tenant or landlord signs the escrow agreement
// @Tags orders
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param body body SignRequest true "Signature proof"
// @Success 200 {object} Order
// @Failure 400 {object} map[string]string
// @Router /orders/{id}/sign [post]
func (h *Handler) Sign(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.service.Sign(id, userID)
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

// ─── Settle godoc ───────────────────────────────────────────────────
// @Summary Settle an order (close escrow)
// @Description Landlord settles the escrow — deposit is released
// @Tags orders
// @Security BearerAuth
// @Produce json
// @Param id path string true "Order ID"
// @Success 200 {object} Order
// @Failure 400 {object} map[string]string
// @Router /orders/{id}/settle [post]
func (h *Handler) Settle(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	o, err := h.service.Settle(id, userID)
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

// ─── OpenDispute godoc ──────────────────────────────────────────────
// @Summary Open a dispute
// @Description Either party can open a dispute while the order is active
// @Tags orders
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param body body DisputeRequest true "Dispute reason"
// @Success 200 {object} Order
// @Failure 400 {object} map[string]string
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
		http.Error(w, `{"error":"reason is required"}`, http.StatusBadRequest)
		return
	}

	o, err := h.service.OpenDispute(id, userID, req.Reason)
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

// ─── ResolveDispute godoc ───────────────────────────────────────────
// @Summary Resolve a dispute
// @Description Arbiter resolves dispute in favor of tenant or landlord
// @Tags orders
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param body body ResolveDisputeRequest true "Resolution details"
// @Success 200 {object} Order
// @Failure 400 {object} map[string]string
// @Router /orders/{id}/resolve [post]
func (h *Handler) ResolveDispute(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	var req ResolveDisputeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	o, err := h.service.ResolveDispute(id, userID, req.Winner, req.Reason)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrInvalidWinner {
			status = http.StatusBadRequest
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(o)
}

// ─── PayRent godoc ──────────────────────────────────────────────────
// @Summary Pay rent
// @Description Tenant pays rent for a period (only when order is active)
// @Tags orders
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param body body PayRentRequest true "Payment details"
// @Success 201 {object} RentPayment
// @Failure 400 {object} map[string]string
// @Router /orders/{id}/pay-rent [post]
func (h *Handler) PayRent(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	var req PayRentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	payment, err := h.service.PayRent(id, userID, &req)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrOrderNotFound {
			status = http.StatusNotFound
		} else if err == ErrForbidden {
			status = http.StatusForbidden
		} else if err == ErrNotActive {
			status = http.StatusConflict
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payment)
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
