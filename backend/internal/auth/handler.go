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

type signupRequest struct {
	Username      string `json:"username"`
	FirstName     string `json:"first_name"`
	LastName      string `json:"last_name"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	Password      string `json:"password"`
	WalletAddress string `json:"wallet_address"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Signup godoc
// @Summary User signup
// @Description User signup
// @Tags auth
// @Param request body signupRequest true "Signup request payload"
// @Success 201 {object} authResponse
// @Failure 400 {object} errorResponse
// @Router /auth/signup [post]
func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Валидация — все поля обязательны
	if req.Username == "" || req.FirstName == "" || req.LastName == "" ||
		req.Email == "" || req.Phone == "" || req.Password == "" {
		http.Error(w, `{"error":"all fields are required: username, first_name, last_name, email, phone, password"}`, http.StatusBadRequest)
		return
	}

	passwordHash, err := h.authService.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"failed to process password"}`, http.StatusInternalServerError)
		return
	}

	u, err := h.userStore.CreateByCredentials(user.CreateUserInput{
		Username:      req.Username,
		FirstName:     req.FirstName,
		LastName:      req.LastName,
		Email:         req.Email,
		Phone:         req.Phone,
		PasswordHash:  passwordHash,
		WalletAddress: req.WalletAddress,
	})
	if err != nil {
		// Проверяем конфликт уникальности (username или email уже заняты)
		if isUniqueViolation(err) {
			http.Error(w, `{"error":"username or email already taken"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
		return
	}

	token, err := h.authService.GenerateJWT(u.ID, u.WalletAddress)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(authResponse{Token: token, User: u})
}

// Login godoc
// @Summary User login
// @Description User login
// @Tags auth
// @Param request body loginRequest true "Login request payload"
// @Success 200 {object} authResponse
// @Failure 400 {object} errorResponse
// @Failure 401 {object} errorResponse
// @Router /auth/login [post]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" {
		http.Error(w, `{"error":"username and password are required"}`, http.StatusBadRequest)
		return
	}

	u, passwordHash, err := h.userStore.GetByUsername(req.Username)
	if err != nil {
		// Намеренно одинаковая ошибка — не раскрываем, существует ли пользователь
		http.Error(w, `{"error":"invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	if err := h.authService.CheckPassword(passwordHash, req.Password); err != nil {
		http.Error(w, `{"error":"invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	token, err := h.authService.GenerateJWT(u.ID, u.WalletAddress)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{Token: token, User: u})
}

// GetNonce godoc
// @Summary Get authentication nonce
// @Description Returns a nonce for wallet signature authentication
// @Tags auth
// @Param wallet query string true "Wallet address"
// @Success 200 {object} nonceResponse
// @Router /auth/nonce [get]
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

// Verify godoc
// @Summary Verify wallet signature
// @Description Verifies wallet signature and returns JWT token
// @Tags auth
// @Accept json
// @Produce json
// @Param body body verifyRequest true "Verification request"
// @Success 200 {object} authResponse
// @Failure 401 {object} map[string]string
// @Router /auth/verify [post]
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

	u, err := h.userStore.GetByWallet(req.Wallet)
	if err != nil {
		// Wallet not registered — frontend should redirect to registration
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error":  "wallet_not_registered",
			"wallet": req.Wallet,
		})
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

// Refresh godoc
// @Summary Refresh JWT token
// @Description Returns a new JWT token
// @Tags auth
// @Security BearerAuth
// @Success 200 {object} authResponse
// @Router /auth/refresh [post]
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
