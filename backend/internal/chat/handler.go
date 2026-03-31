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

// ListConversations godoc
// @Summary List conversations
// @Description Returns all conversations for the authenticated user
// @Tags chat
// @Security BearerAuth
// @Produce json
// @Success 200 {array} Conversation
// @Router /conversations [get]
func (h *Handler) ListConversations(w http.ResponseWriter, r *http.Request) {
	id := mw.GetUserID(r.Context())
	if id == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	convs, err := h.store.ListConversations(id)
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

// GetMessages godoc
// @Summary Get messages
// @Description Returns messages for a conversation with pagination
// @Tags chat
// @Security BearerAuth
// @Produce json
// @Param id path string true "Conversation ID"
// @Param before query string false "Load messages before this timestamp (RFC3339)"
// @Param limit query int false "Limit results (default 20, max 100)"
// @Success 200 {array} Message
// @Router /conversations/{id}/messages [get]
func (h *Handler) GetMessages(w http.ResponseWriter, r *http.Request) {
	id := mw.GetUserID(r.Context())
	if id == "" {
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
	if conv.LandlordID != id && conv.LoanerID != id {
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

type createConversationRequest struct {
	PropertyID string `json:"property_id"`
	LandlordID string `json:"landlord_id"`
}

// CreateConversation godoc
// @Summary Create or get a conversation
// @Description Creates a new conversation between the authenticated user (loaner) and a landlord for a property, or returns the existing one
// @Tags chat
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body createConversationRequest true "Conversation details"
// @Success 200 {object} Conversation
// @Router /conversations [post]
func (h *Handler) CreateConversation(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req createConversationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.PropertyID == "" || req.LandlordID == "" {
		http.Error(w, `{"error":"property_id and landlord_id are required"}`, http.StatusBadRequest)
		return
	}

	if req.LandlordID == userID {
		http.Error(w, `{"error":"cannot start a conversation with yourself"}`, http.StatusBadRequest)
		return
	}

	conv, err := h.store.GetOrCreateConversation(req.PropertyID, req.LandlordID, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to create conversation"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conv)
}

type sendMessageRequest struct {
	ConversationID string `json:"conversation_id"`
	Content        string `json:"content"`
}

// SendMessage godoc
// @Summary Send a message
// @Description Sends a message in a conversation
// @Tags chat
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body sendMessageRequest true "Message content"
// @Success 200 {object} Message
// @Router /conversations/messages [post]
func (h *Handler) SendMessage(w http.ResponseWriter, r *http.Request) {
	id := mw.GetUserID(r.Context())
	if id == "" {
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
	if conv.LandlordID != id && conv.LoanerID != id {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	msg, err := h.store.SaveMessage(conv.ID, id, req.Content)
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
	id := mw.GetUserID(r.Context())
	if id == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	mockLandlord := "DevLandlord111111111111111111111111111111111"
	propertyID := "prop-1042-market-st"

	conv, err := h.store.GetOrCreateConversation(propertyID, mockLandlord, id)
	if err != nil {
		http.Error(w, `{"error":"failed to seed conversation"}`, http.StatusInternalServerError)
		return
	}

	// Add a welcome message from the landlord
	_, _ = h.store.SaveMessage(conv.ID, mockLandlord, "Hi! Interested in renting 1042 Market St?")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conv)
}
