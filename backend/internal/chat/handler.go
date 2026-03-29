package chat

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	mw "github.com/abdro/decentrarent/backend/internal/middleware"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListConversations(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	if wallet == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	convs, err := h.store.ListConversations(wallet)
	if err != nil {
		http.Error(w, `{"error":"failed to list conversations"}`, http.StatusInternalServerError)
		return
	}

	if convs == nil {
		convs = []Conversation{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(convs)
}

func (h *Handler) GetMessages(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	if wallet == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	conversationID := chi.URLParam(r, "id")

	// Verify the user is a participant
	conv, err := h.store.GetConversation(conversationID)
	if err != nil {
		http.Error(w, `{"error":"conversation not found"}`, http.StatusNotFound)
		return
	}
	if conv.LandlordWallet != wallet && conv.LoanerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var before *time.Time
	if b := r.URL.Query().Get("before"); b != "" {
		if t, err := time.Parse(time.RFC3339Nano, b); err == nil {
			before = &t
		}
	}

	msgs, err := h.store.GetMessages(conversationID, before, limit)
	if err != nil {
		http.Error(w, `{"error":"failed to get messages"}`, http.StatusInternalServerError)
		return
	}

	if msgs == nil {
		msgs = []Message{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msgs)
}

type sendMessageRequest struct {
	ConversationID string `json:"conversation_id"`
	Content        string `json:"content"`
}

func (h *Handler) SendMessage(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	if wallet == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	conv, err := h.store.GetConversation(req.ConversationID)
	if err != nil {
		http.Error(w, `{"error":"conversation not found"}`, http.StatusNotFound)
		return
	}
	if conv.LandlordWallet != wallet && conv.LoanerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	msg, err := h.store.SaveMessage(conv.ID, wallet, req.Content)
	if err != nil {
		http.Error(w, `{"error":"failed to save message"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

// SeedChat creates a mock conversation for dev/testing.
// The authenticated user becomes the loaner, a fake landlord is created.
func (h *Handler) SeedChat(w http.ResponseWriter, r *http.Request) {
	wallet := mw.GetWalletAddress(r.Context())
	if wallet == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	mockLandlord := "DevLandlord111111111111111111111111111111111"
	propertyID := "prop-1042-market-st"

	conv, err := h.store.GetOrCreateConversation(propertyID, mockLandlord, wallet)
	if err != nil {
		http.Error(w, `{"error":"failed to seed conversation"}`, http.StatusInternalServerError)
		return
	}

	// Add a welcome message from the landlord
	_, _ = h.store.SaveMessage(conv.ID, mockLandlord, "Hi! Interested in renting 1042 Market St?")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conv)
}
