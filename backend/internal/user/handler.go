package user

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	mw "github.com/abdro/decentrarent/backend/internal/middleware"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

// GetMe godoc
// @Summary Get current user
// @Description Returns the authenticated user's profile
// @Tags user
// @Security BearerAuth
// @Produce json
// @Success 200 {object} User
// @Router /user/me [get]
func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	u, err := h.store.GetByID(userID)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(u)
}

// UpdateProfile godoc
// @Summary Update user profile
// @Description Updates the authenticated user's profile fields
// @Tags user
// @Security BearerAuth
// @Param request body UpdateProfileInput true "Profile fields"
// @Success 200 {object} User
// @Router /user/me [put]
func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var inp UpdateProfileInput
	if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	u, err := h.store.UpdateProfile(userID, inp)
	if err != nil {
		http.Error(w, `{"error":"failed to update profile"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(u)
}

// GetPublicProfile godoc
// @Summary Get user public profile
// @Description Returns a user's public profile by ID (display_name only)
// @Tags user
// @Produce json
// @Param id path string true "User ID"
// @Success 200 {object} map[string]string
// @Router /users/{id} [get]
func (h *Handler) GetPublicProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, `{"error":"missing id"}`, http.StatusBadRequest)
		return
	}

	u, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	name := u.DisplayName
	if name == "" {
		name = u.WalletAddress
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"id":             u.ID,
		"display_name":   name,
		"wallet_address": u.WalletAddress,
	})
}
