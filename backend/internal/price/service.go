package price

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
)

// Service fetches and caches the SOL/USDT price.
type Service struct {
	mu        sync.RWMutex
	priceUSDT float64
	updatedAt time.Time
	client    *http.Client
}

func NewService() *Service {
	s := &Service{
		client: &http.Client{Timeout: 10 * time.Second},
	}
	// Fetch initial price synchronously so first request has data.
	if err := s.refresh(); err != nil {
		log.Printf("[price] initial fetch failed: %v", err)
	}
	return s
}

// Start begins the background refresh loop. Call in a goroutine.
func (s *Service) Start(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		if err := s.refresh(); err != nil {
			log.Printf("[price] refresh failed: %v", err)
		}
	}
}

// GetPrice returns the cached SOL price in USDT and the time it was last updated.
func (s *Service) GetPrice() (float64, time.Time) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.priceUSDT, s.updatedAt
}

// coingecko simple/price response
type cgResponse struct {
	Solana struct {
		USDT float64 `json:"usd"`
	} `json:"solana"`
}

func (s *Service) refresh() error {
	resp, err := s.client.Get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var cg cgResponse
	if err := json.NewDecoder(resp.Body).Decode(&cg); err != nil {
		return err
	}

	if cg.Solana.USDT <= 0 {
		return nil // keep old value
	}

	s.mu.Lock()
	s.priceUSDT = cg.Solana.USDT
	s.updatedAt = time.Now()
	s.mu.Unlock()

	log.Printf("[price] SOL/USD updated: %.2f", cg.Solana.USDT)
	return nil
}
