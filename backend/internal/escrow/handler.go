package escrow

import (
	"encoding/json"
	"net/http"

	"github.com/gagliardetto/solana-go"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type EscrowParams struct {
	Landlord string `json:"landlord"`
	Tenant   string `json:"tenant"`
	OrderID  string `json:"order_id"`
}

type DisputeRequest struct {
	EscrowParams
	Reason string `json:"reason"`
}

type TxResponse struct {
	Signature string `json:"signature"`
	Status    string `json:"status"`
}

func (h *Handler) ReleaseToTenant(w http.ResponseWriter, r *http.Request) {
	var req EscrowParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		writeError(w, "invalid uuid", http.StatusBadRequest)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(req.Landlord)
	tenant := solana.MustPublicKeyFromBase58(req.Tenant)

	sig, err := h.service.ReleaseToTenant(r.Context(), landlord, tenant, orderID)
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, TxResponse{Signature: sig, Status: "settled"})
}

func (h *Handler) ReleaseToLandlord(w http.ResponseWriter, r *http.Request) {
	var req DisputeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		writeError(w, "invalid uuid", http.StatusBadRequest)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(req.Landlord)
	tenant := solana.MustPublicKeyFromBase58(req.Tenant)

	sig, err := h.service.ReleaseToLandlord(r.Context(), landlord, tenant, orderID, req.Reason)
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, TxResponse{Signature: sig, Status: "settled"})
}

func (h *Handler) OpenDispute(w http.ResponseWriter, r *http.Request) {
	var req DisputeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		writeError(w, "invalid uuid", http.StatusBadRequest)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(req.Landlord)
	tenant := solana.MustPublicKeyFromBase58(req.Tenant)

	sig, err := h.service.OpenDispute(r.Context(), landlord, tenant, orderID, req.Reason)
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, TxResponse{Signature: sig, Status: "disputed"})
}

func (h *Handler) ResolveDisputeTenant(w http.ResponseWriter, r *http.Request) {
	var req DisputeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		writeError(w, "invalid uuid", http.StatusBadRequest)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(req.Landlord)
	tenant := solana.MustPublicKeyFromBase58(req.Tenant)

	sig, err := h.service.ResolveDisputeTenant(r.Context(), landlord, tenant, orderID, req.Reason)
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, TxResponse{Signature: sig, Status: "dispute_resolved_tenant"})
}

func (h *Handler) ResolveDisputeLandlord(w http.ResponseWriter, r *http.Request) {
	var req DisputeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		writeError(w, "invalid uuid", http.StatusBadRequest)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(req.Landlord)
	tenant := solana.MustPublicKeyFromBase58(req.Tenant)

	sig, err := h.service.ResolveDisputeLandlord(r.Context(), landlord, tenant, orderID, req.Reason)
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, TxResponse{Signature: sig, Status: "dispute_resolved_landlord"})
}

func (h *Handler) ExpireEscrow(w http.ResponseWriter, r *http.Request) {
	var req EscrowParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	orderID, err := uuid.Parse(req.OrderID)
	if err != nil {
		writeError(w, "invalid uuid", http.StatusBadRequest)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(req.Landlord)
	tenant := solana.MustPublicKeyFromBase58(req.Tenant)

	sig, err := h.service.ExpireEscrow(r.Context(), landlord, tenant, orderID)
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, TxResponse{Signature: sig, Status: "expired"})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

/*
# Release to tenant
curl -X POST http://localhost:8080/escrow/release-to-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "landlord": "LANDLORD_PUBKEY_BASE58",
    "tenant":   "TENANT_PUBKEY_BASE58",
    "order_id": "550e8400-e29b-41d4-a716-446655440000"
  }'

# Release to landlord
curl -X POST http://localhost:8080/escrow/release-to-landlord \
  -H "Content-Type: application/json" \
  -d '{
    "landlord": "LANDLORD_PUBKEY_BASE58",
    "tenant":   "TENANT_PUBKEY_BASE58",
    "order_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason":   "Tenant damaged the floor"
  }'

# Open dispute
curl -X POST http://localhost:8080/escrow/dispute \
  -H "Content-Type: application/json" \
  -d '{
    "landlord": "LANDLORD_PUBKEY_BASE58",
    "tenant":   "TENANT_PUBKEY_BASE58",
    "order_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason":   "Tenant refuses to leave"
  }'

# Resolve dispute → tenant
curl -X POST http://localhost:8080/escrow/dispute/resolve-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "landlord": "LANDLORD_PUBKEY_BASE58",
    "tenant":   "TENANT_PUBKEY_BASE58",
    "order_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason":   "Landlord did not provide keys"
  }'

# Resolve dispute → landlord
curl -X POST http://localhost:8080/escrow/dispute/resolve-landlord \
  -H "Content-Type: application/json" \
  -d '{
    "landlord": "LANDLORD_PUBKEY_BASE58",
    "tenant":   "TENANT_PUBKEY_BASE58",
    "order_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason":   "Property damage confirmed"
  }'

# Expire escrow
curl -X POST http://localhost:8080/escrow/expire \
  -H "Content-Type: application/json" \
  -d '{
    "landlord": "LANDLORD_PUBKEY_BASE58",
    "tenant":   "TENANT_PUBKEY_BASE58",
    "order_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
*/
