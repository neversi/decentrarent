package media

import "time"

type PropertyMedia struct {
	ID         string    `json:"id"`
	PropertyID string    `json:"property_id"`
	FileKey    string    `json:"file_key"`
	SortOrder  int       `json:"sort_order"`
	CreatedAt  time.Time `json:"created_at"`
}

type MediaResponse struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	SortOrder int    `json:"sort_order"`
}

type UploadURLRequest struct {
	FileName string `json:"file_name"`
}

type UploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	FileKey   string `json:"file_key"`
}

type RegisterMediaRequest struct {
	FileKey string `json:"file_key"`
}

type ReorderRequest struct {
	Order []string `json:"order"`
}
