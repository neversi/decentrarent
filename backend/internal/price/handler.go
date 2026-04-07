package price

import (
	"encoding/json"
	"net/http"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type PriceResponse struct {
	PriceUSDT float64 `json:"price_usdt"`
	UpdatedAt string  `json:"updated_at"`
}

// GetSOLPrice godoc
// @Summary Get current SOL/USDT price
// @Description Returns the cached SOL price in USDT
// @Tags price
// @Produce json
// @Success 200 {object} PriceResponse
// @Router /sol-price [get]
func (h *Handler) GetSOLPrice(w http.ResponseWriter, r *http.Request) {
	price, updatedAt := h.service.GetPrice()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PriceResponse{
		PriceUSDT: price,
		UpdatedAt: updatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	})
}
