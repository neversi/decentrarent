package user

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
	query := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		wallet_address TEXT UNIQUE NOT NULL,
		display_name TEXT NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT NOW()
	)`
	_, err := s.db.Exec(query)
	return err
}

func (s *Store) UpsertByWallet(walletAddress string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		"SELECT id, wallet_address, display_name, created_at FROM users WHERE wallet_address = $1",
		walletAddress,
	).Scan(&u.ID, &u.WalletAddress, &u.DisplayName, &u.CreatedAt)

	if err == sql.ErrNoRows {
		u = &User{
			ID:            uuid.New().String(),
			WalletAddress: walletAddress,
			DisplayName:   "",
			CreatedAt:     time.Now(),
		}
		_, err = s.db.Exec(
			"INSERT INTO users (id, wallet_address, display_name, created_at) VALUES ($1, $2, $3, $4)",
			u.ID, u.WalletAddress, u.DisplayName, u.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		return u, nil
	}

	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) GetByID(id string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		"SELECT id, wallet_address, display_name, created_at FROM users WHERE id = $1",
		id,
	).Scan(&u.ID, &u.WalletAddress, &u.DisplayName, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}
