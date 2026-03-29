package media

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS property_media (
			id          TEXT PRIMARY KEY,
			property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
			file_key    TEXT NOT NULL,
			sort_order  INT NOT NULL DEFAULT 0,
			created_at  TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_property_media_property ON property_media(property_id)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Create(propertyID, fileKey string) (*PropertyMedia, error) {
	var maxOrder int
	err := s.db.QueryRow(
		`SELECT COALESCE(MAX(sort_order), -1) FROM property_media WHERE property_id = $1`,
		propertyID,
	).Scan(&maxOrder)
	if err != nil {
		return nil, err
	}

	m := &PropertyMedia{
		ID:         uuid.New().String(),
		PropertyID: propertyID,
		FileKey:    fileKey,
		SortOrder:  maxOrder + 1,
		CreatedAt:  time.Now(),
	}

	_, err = s.db.Exec(
		`INSERT INTO property_media (id, property_id, file_key, sort_order, created_at) VALUES ($1, $2, $3, $4, $5)`,
		m.ID, m.PropertyID, m.FileKey, m.SortOrder, m.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) ListByProperty(propertyID string) ([]PropertyMedia, error) {
	rows, err := s.db.Query(
		`SELECT id, property_id, file_key, sort_order, created_at FROM property_media WHERE property_id = $1 ORDER BY sort_order`,
		propertyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []PropertyMedia
	for rows.Next() {
		var m PropertyMedia
		if err := rows.Scan(&m.ID, &m.PropertyID, &m.FileKey, &m.SortOrder, &m.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	return items, nil
}

func (s *Store) Delete(id string) (*PropertyMedia, error) {
	m := &PropertyMedia{}
	err := s.db.QueryRow(
		`SELECT id, property_id, file_key, sort_order, created_at FROM property_media WHERE id = $1`, id,
	).Scan(&m.ID, &m.PropertyID, &m.FileKey, &m.SortOrder, &m.CreatedAt)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(`DELETE FROM property_media WHERE id = $1`, id)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) Reorder(propertyID string, order []string) error {
	for i, id := range order {
		_, err := s.db.Exec(
			`UPDATE property_media SET sort_order = $1 WHERE id = $2 AND property_id = $3`,
			i, id, propertyID,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) DeleteByProperty(propertyID string) ([]PropertyMedia, error) {
	items, err := s.ListByProperty(propertyID)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Exec(`DELETE FROM property_media WHERE property_id = $1`, propertyID)
	if err != nil {
		return nil, err
	}
	return items, nil
}
