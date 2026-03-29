package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/mr-tron/base58"
	"golang.org/x/crypto/bcrypt"
)

type NonceEntry struct {
	Value     string
	ExpiresAt time.Time
}

type Service struct {
	jwtSecret []byte
	nonces    map[string]*NonceEntry // wallet -> nonce
	mu        sync.RWMutex
}

func NewService(jwtSecret string) *Service {
	s := &Service{
		jwtSecret: []byte(jwtSecret),
		nonces:    make(map[string]*NonceEntry),
	}
	go s.cleanupExpiredNonces()
	return s
}

func (s *Service) GenerateNonce(wallet string) (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(bytes)

	s.mu.Lock()
	s.nonces[wallet] = &NonceEntry{
		Value:     nonce,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	s.mu.Unlock()

	return nonce, nil
}

func (s *Service) VerifySignature(wallet, signature, nonce string) error {
	s.mu.RLock()
	entry, exists := s.nonces[wallet]
	s.mu.RUnlock()

	if !exists {
		return fmt.Errorf("no nonce found for wallet")
	}
	if time.Now().After(entry.ExpiresAt) {
		s.mu.Lock()
		delete(s.nonces, wallet)
		s.mu.Unlock()
		return fmt.Errorf("nonce expired")
	}
	if entry.Value != nonce {
		return fmt.Errorf("nonce mismatch")
	}

	pubKeyBytes, err := base58.Decode(wallet)
	if err != nil {
		return fmt.Errorf("invalid wallet address: %w", err)
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key length")
	}

	sigBytes, err := base58.Decode(signature)
	if err != nil {
		return fmt.Errorf("invalid signature: %w", err)
	}

	message := []byte(fmt.Sprintf("Sign this message to authenticate with DecentraRent: %s", nonce))
	if !ed25519.Verify(pubKeyBytes, message, sigBytes) {
		return fmt.Errorf("signature verification failed")
	}

	// Consume the nonce
	s.mu.Lock()
	delete(s.nonces, wallet)
	s.mu.Unlock()

	return nil
}

type Claims struct {
	UserID        string `json:"user_id"`
	WalletAddress string `json:"wallet_address"`
	jwt.RegisteredClaims
}

func (s *Service) GenerateJWT(userID, walletAddress string) (string, error) {
	claims := Claims{
		UserID:        userID,
		WalletAddress: walletAddress,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   walletAddress,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *Service) ValidateJWT(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

func (s *Service) cleanupExpiredNonces() {
	ticker := time.NewTicker(1 * time.Minute)
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for wallet, entry := range s.nonces {
			if now.After(entry.ExpiresAt) {
				delete(s.nonces, wallet)
			}
		}
		s.mu.Unlock()
	}
}

// HashPassword — bcrypt с дефолтной стоимостью (10 итераций)
func (s *Service) HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// CheckPassword — сравнивает пароль с хэшем
func (s *Service) CheckPassword(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
