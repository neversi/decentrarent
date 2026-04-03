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
	store   *Store
	service *Service
}

func NewHandler(store *Store, service *Service) *Handler {
	return &Handler{store: store, service: service}
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

// DeleteConversation godoc
// @Summary Delete a conversation
// @Description Deletes a conversation if the user is a participant
// @Tags chat
// @Security BearerAuth
// @Param id path string true "Conversation ID"
// @Success 204 "No Content"
// @Router /conversations/{id} [delete]
func (h *Handler) DeleteConversation(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	convID := chi.URLParam(r, "id")
	if err := h.store.DeleteConversation(convID, userID); err != nil {
		http.Error(w, `{"error":"failed to delete conversation"}`, http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetMessages godoc
// @Summary Get messages
// @Description Returns messages for a conversation with pagination. Supports all message types: text, system, document, modal.
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

// ─── Send Document ──────────────────────────────────────────────────

type sendDocumentRequest struct {
	ConversationID string `json:"conversation_id"`
	Content        string `json:"content"`       // описание
	DocumentURL    string `json:"document_url"`  // ссылка на файл
	DocumentName   string `json:"document_name"` // имя файла
	OrderID        string `json:"order_id"`      // привязка к ордеру
}

// SendDocument godoc
// @Summary Send a document in chat
// @Description Sends a document (agreement PDF, etc.) in a conversation
// @Tags chat
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body sendDocumentRequest true "Document details"
// @Success 200 {object} Message
// @Router /conversations/documents [post]
func (h *Handler) SendDocument(w http.ResponseWriter, r *http.Request) {
	id := mw.GetUserID(r.Context())
	if id == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req sendDocumentRequest
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

	msg, err := h.service.SendDocumentMessage(conv.ID, req.Content, req.DocumentURL, req.DocumentName, req.OrderID)
	if err != nil {
		http.Error(w, `{"error":"failed to send document"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}
