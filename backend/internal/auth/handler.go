package auth

import (
	"encoding/json"
	"net/http"

	mw "github.com/abdro/decentrarent/backend/internal/middleware"
	"github.com/abdro/decentrarent/backend/internal/user"
)

type Handler struct {
	authService *Service
	userStore   *user.Store
}

func NewHandler(authService *Service, userStore *user.Store) *Handler {
	return &Handler{
		authService: authService,
		userStore:   userStore,
	}
}

type nonceResponse struct {
	Nonce   string `json:"nonce"`
	Message string `json:"message"`
}

func (h *Handler) GetNonce(w http.ResponseWriter, r *http.Request) {
	wallet := r.URL.Query().Get("wallet")
	if wallet == "" {
		http.Error(w, `{"error":"wallet parameter required"}`, http.StatusBadRequest)
		return
	}

	nonce, err := h.authService.GenerateNonce(wallet)
	if err != nil {
		http.Error(w, `{"error":"failed to generate nonce"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nonceResponse{
		Nonce:   nonce,
		Message: "Sign this message to authenticate with DecentraRent: " + nonce,
	})
}

type verifyRequest struct {
	Wallet    string `json:"wallet"`
	Signature string `json:"signature"`
	Nonce     string `json:"nonce"`
}

type authResponse struct {
	Token string     `json:"token"`
	User  *user.User `json:"user"`
}

func (h *Handler) Verify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Wallet == "" || req.Signature == "" || req.Nonce == "" {
		http.Error(w, `{"error":"wallet, signature, and nonce are required"}`, http.StatusBadRequest)
		return
	}

	if err := h.authService.VerifySignature(req.Wallet, req.Signature, req.Nonce); err != nil {
		http.Error(w, `{"error":"signature verification failed"}`, http.StatusUnauthorized)
		return
	}

	u, err := h.userStore.UpsertByWallet(req.Wallet)
	if err != nil {
		http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
		return
	}

	token, err := h.authService.GenerateJWT(u.ID, u.WalletAddress)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{
		Token: token,
		User:  u,
	})
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	walletAddress := mw.GetWalletAddress(r.Context())

	token, err := h.authService.GenerateJWT(userID, walletAddress)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	u, err := h.userStore.GetByID(userID)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{
		Token: token,
		User:  u,
	})
}
