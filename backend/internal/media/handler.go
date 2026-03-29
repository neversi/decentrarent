package media

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	mw "github.com/abdro/decentrarent/backend/internal/middleware"
	"github.com/abdro/decentrarent/backend/internal/property"
)

type Handler struct {
	store         *Store
	s3            *S3Client
	propertyStore *property.Store
}

func NewHandler(store *Store, s3 *S3Client, propertyStore *property.Store) *Handler {
	return &Handler{store: store, s3: s3, propertyStore: propertyStore}
}

func (h *Handler) checkOwner(r *http.Request) (*property.Property, string, error) {
	wallet := mw.GetUserID(r.Context())
	propertyID := chi.URLParam(r, "id")
	p, err := h.propertyStore.GetByID(propertyID)
	if err != nil {
		return nil, wallet, err
	}
	return p, wallet, nil
}

// GetUploadURL godoc
// @Summary Get presigned upload URL
// @Description Returns a presigned MinIO URL for direct file upload (owner only)
// @Tags media
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Property ID"
// @Param body body UploadURLRequest true "File name"
// @Success 200 {object} UploadURLResponse
// @Router /properties/{id}/media/upload-url [post]
func (h *Handler) GetUploadURL(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req UploadURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileName == "" {
		http.Error(w, `{"error":"file_name is required"}`, http.StatusBadRequest)
		return
	}

	uploadURL, fileKey, err := h.s3.GenerateUploadURL(p.ID, req.FileName)
	if err != nil {
		http.Error(w, `{"error":"failed to generate upload URL"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(UploadURLResponse{
		UploadURL: uploadURL,
		FileKey:   fileKey,
	})
}

// Register godoc
// @Summary Register uploaded media
// @Description Registers a media file after it has been uploaded to MinIO (owner only)
// @Tags media
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Property ID"
// @Param body body RegisterMediaRequest true "File key from upload"
// @Success 201 {object} PropertyMedia
// @Router /properties/{id}/media [post]
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req RegisterMediaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileKey == "" {
		http.Error(w, `{"error":"file_key is required"}`, http.StatusBadRequest)
		return
	}

	m, err := h.store.Create(p.ID, req.FileKey)
	if err != nil {
		http.Error(w, `{"error":"failed to register media"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(m)
}

// Delete godoc
// @Summary Delete media
// @Description Deletes a media item and its S3 object (owner only)
// @Tags media
// @Security BearerAuth
// @Param id path string true "Property ID"
// @Param mediaId path string true "Media ID"
// @Success 204
// @Router /properties/{id}/media/{mediaId} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	mediaID := chi.URLParam(r, "mediaId")
	m, err := h.store.Delete(mediaID)
	if err != nil {
		http.Error(w, `{"error":"media not found"}`, http.StatusNotFound)
		return
	}

	_ = h.s3.DeleteObject(m.FileKey)

	w.WriteHeader(http.StatusNoContent)
}

// Reorder godoc
// @Summary Reorder media
// @Description Updates the sort order of media items (owner only)
// @Tags media
// @Security BearerAuth
// @Accept json
// @Param id path string true "Property ID"
// @Param body body ReorderRequest true "Ordered list of media IDs"
// @Success 204
// @Router /properties/{id}/media/order [put]
func (h *Handler) Reorder(w http.ResponseWriter, r *http.Request) {
	p, wallet, err := h.checkOwner(r)
	if err != nil {
		http.Error(w, `{"error":"property not found"}`, http.StatusNotFound)
		return
	}
	if p.OwnerWallet != wallet {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req ReorderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Order) == 0 {
		http.Error(w, `{"error":"order array is required"}`, http.StatusBadRequest)
		return
	}

	if err := h.store.Reorder(p.ID, req.Order); err != nil {
		http.Error(w, `{"error":"failed to reorder media"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetMediaForProperty returns media with presigned download URLs for a property.
// Returns []map[string]interface{} to satisfy property.MediaEnricher interface without import cycle.
func (h *Handler) GetMediaForProperty(propertyID string) []map[string]interface{} {
	items, err := h.store.ListByProperty(propertyID)
	if err != nil || items == nil {
		return []map[string]interface{}{}
	}

	result := make([]map[string]interface{}, 0, len(items))
	for _, m := range items {
		url, err := h.s3.GenerateDownloadURL(m.FileKey)
		if err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"id":         m.ID,
			"url":        url,
			"sort_order": m.SortOrder,
		})
	}
	return result
}

// DeleteMediaForProperty deletes all S3 objects for a property.
// Satisfies property.MediaCleaner interface.
func (h *Handler) DeleteMediaForProperty(propertyID string) {
	items, err := h.store.DeleteByProperty(propertyID)
	if err != nil {
		return
	}
	for _, m := range items {
		_ = h.s3.DeleteObject(m.FileKey)
	}
}
