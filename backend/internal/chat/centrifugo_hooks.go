package chat

import (
	"encoding/json"
	"net/http"

	"github.com/abdro/decentrarent/backend/internal/auth"
)

type CentrifugoHandler struct {
	authService *auth.Service
	chatService *Service
}

func NewCentrifugoHandler(authService *auth.Service, chatService *Service) *CentrifugoHandler {
	return &CentrifugoHandler{
		authService: authService,
		chatService: chatService,
	}
}

// Centrifugo proxy request/response types

type connectRequest struct {
	Token string `json:"token"`
}

type connectProxy struct {
	Client    string         `json:"client"`
	Transport string         `json:"transport"`
	Protocol  string         `json:"protocol"`
	Data      connectRequest `json:"data"`
	Token     string         `json:"token"`
}

type connectResult struct {
	User string `json:"user"`
}

type connectResponse struct {
	Result *connectResult `json:"result,omitempty"`
	Error  *proxyError    `json:"error,omitempty"`
}

type subscribeProxy struct {
	Client  string `json:"client"`
	User    string `json:"user"`
	Channel string `json:"channel"`
}

type subscribeResult struct{}

type subscribeResponse struct {
	Result *subscribeResult `json:"result,omitempty"`
	Error  *proxyError      `json:"error,omitempty"`
}

type publishProxy struct {
	Client  string          `json:"client"`
	User    string          `json:"user"`
	Channel string          `json:"channel"`
	Data    json.RawMessage `json:"data"`
}

type publishMessage struct {
	Content string `json:"content"`
}

type publishResult struct{}

type publishResponse struct {
	Result *publishResult `json:"result,omitempty"`
	Error  *proxyError    `json:"error,omitempty"`
}

type proxyError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Connect handles Centrifugo connect proxy requests.
// Validates the JWT token and returns the user identity.
func (h *CentrifugoHandler) Connect(w http.ResponseWriter, r *http.Request) {
	var req connectProxy
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, connectResponse{Error: &proxyError{Code: 400, Message: "bad request"}})
		return
	}

	token := req.Token
	if token == "" {
		token = req.Data.Token
	}

	claims, err := h.authService.ValidateJWT(token)
	if err != nil {
		writeJSON(w, connectResponse{Error: &proxyError{Code: 401, Message: "unauthorized"}})
		return
	}

	writeJSON(w, connectResponse{Result: &connectResult{User: claims.WalletAddress}})
}

// Subscribe handles Centrifugo subscribe proxy requests.
// Checks if the user is allowed to subscribe to the channel.
func (h *CentrifugoHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	var req subscribeProxy
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, subscribeResponse{Error: &proxyError{Code: 400, Message: "bad request"}})
		return
	}

	if err := h.chatService.CanSubscribe(req.Channel, req.User); err != nil {
		writeJSON(w, subscribeResponse{Error: &proxyError{Code: 403, Message: "forbidden"}})
		return
	}

	writeJSON(w, subscribeResponse{Result: &subscribeResult{}})
}

// Publish handles Centrifugo publish proxy requests.
// Saves the message to the database before allowing delivery.
func (h *CentrifugoHandler) Publish(w http.ResponseWriter, r *http.Request) {
	var req publishProxy
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, publishResponse{Error: &proxyError{Code: 400, Message: "bad request"}})
		return
	}

	var msg publishMessage
	if err := json.Unmarshal(req.Data, &msg); err != nil {
		writeJSON(w, publishResponse{Error: &proxyError{Code: 400, Message: "invalid message data"}})
		return
	}

	if _, err := h.chatService.SaveMessage(req.Channel, req.User, msg.Content); err != nil {
		writeJSON(w, publishResponse{Error: &proxyError{Code: 500, Message: "failed to save message"}})
		return
	}

	writeJSON(w, publishResponse{Result: &publishResult{}})
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
