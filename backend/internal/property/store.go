package property

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Create(landlordID string, req *CreatePropertyRequest, verificationStatus string) (*Property, error) {
	p := &Property{
		ID:                 uuid.New().String(),
		LandlordID:         landlordID,
		Title:              req.Title,
		Description:        req.Description,
		Location:           req.Location,
		Price:              req.Price,
		TokenMint:          req.TokenMint,
		PeriodType:         req.PeriodType,
		Status:             "listed",
		VerificationStatus: verificationStatus,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	_, err := s.db.Exec(
		`INSERT INTO properties (id, landlord_id, title, description, location, price, token_mint, period_type, status, verification_status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		p.ID, p.LandlordID, p.Title, p.Description, p.Location, p.Price, p.TokenMint, p.PeriodType, p.Status, p.VerificationStatus, p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Store) GetByID(id string) (*Property, error) {
	p := &Property{}
	err := s.db.QueryRow(
		`SELECT id, landlord_id, title, description, location, price, token_mint, period_type, status, verification_status, created_at, updated_at
		 FROM properties WHERE id = $1`, id,
	).Scan(&p.ID, &p.LandlordID, &p.Title, &p.Description, &p.Location, &p.Price, &p.TokenMint, &p.PeriodType, &p.Status, &p.VerificationStatus, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Store) List(f *ListFilter) ([]Property, error) {
	query := `SELECT id, landlord_id, title, description, location, price, token_mint, period_type, status, verification_status, created_at, updated_at FROM properties WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if f.Status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, f.Status)
		argIdx++
	}
	if f.LandlordID != "" {
		query += fmt.Sprintf(" AND landlord_id = $%d", argIdx)
		args = append(args, f.LandlordID)
		argIdx++
	}
	if f.TokenMint != "" {
		query += fmt.Sprintf(" AND token_mint = $%d", argIdx)
		args = append(args, f.TokenMint)
		argIdx++
	}
	if f.PeriodType != "" {
		query += fmt.Sprintf(" AND period_type = $%d", argIdx)
		args = append(args, f.PeriodType)
		argIdx++
	}

	query += " ORDER BY created_at DESC"

	if f.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIdx)
		args = append(args, f.Limit)
		argIdx++
	}
	if f.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argIdx)
		args = append(args, f.Offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var props []Property
	for rows.Next() {
		var p Property
		if err := rows.Scan(&p.ID, &p.LandlordID, &p.Title, &p.Description, &p.Location, &p.Price, &p.TokenMint, &p.PeriodType, &p.Status, &p.VerificationStatus, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		props = append(props, p)
	}
	return props, nil
}

func (s *Store) Update(id string, req *UpdatePropertyRequest) (*Property, error) {
	sets := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, *req.Title)
		argIdx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Location != nil {
		sets = append(sets, fmt.Sprintf("location = $%d", argIdx))
		args = append(args, *req.Location)
		argIdx++
	}
	if req.Price != nil {
		sets = append(sets, fmt.Sprintf("price = $%d", argIdx))
		args = append(args, *req.Price)
		argIdx++
	}
	if req.TokenMint != nil {
		sets = append(sets, fmt.Sprintf("token_mint = $%d", argIdx))
		args = append(args, *req.TokenMint)
		argIdx++
	}
	if req.PeriodType != nil {
		sets = append(sets, fmt.Sprintf("period_type = $%d", argIdx))
		args = append(args, *req.PeriodType)
		argIdx++
	}

	if len(sets) == 0 {
		return s.GetByID(id)
	}

	sets = append(sets, fmt.Sprintf("updated_at = $%d", argIdx))
	args = append(args, time.Now())
	argIdx++

	args = append(args, id)
	query := fmt.Sprintf("UPDATE properties SET %s WHERE id = $%d", strings.Join(sets, ", "), argIdx)

	_, err := s.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}
	return s.GetByID(id)
}

func (s *Store) UpdateStatus(id, status string) error {
	_, err := s.db.Exec(
		`UPDATE properties SET status = $1, updated_at = $2 WHERE id = $3`,
		status, time.Now(), id,
	)
	return err
}

func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM properties WHERE id = $1`, id)
	return err
}
