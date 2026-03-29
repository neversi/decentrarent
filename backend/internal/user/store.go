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
		id            TEXT PRIMARY KEY,
        wallet_address TEXT UNIQUE,
        username      TEXT UNIQUE,
        first_name    TEXT NOT NULL DEFAULT '',
        last_name     TEXT NOT NULL DEFAULT '',
        email         TEXT UNIQUE,
        phone         TEXT,
        password_hash TEXT,
        display_name  TEXT NOT NULL DEFAULT '',
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
	)`
	_, err := s.db.Exec(query)
	return err
}

type CreateUserInput struct {
	Username      string
	FirstName     string
	LastName      string
	Email         string
	Phone         string
	PasswordHash  string
	WalletAddress string
}

func (s *Store) CreateByCredentials(inp CreateUserInput) (*User, error) {
	u := &User{
		ID:            uuid.New().String(),
		Username:      inp.Username,
		FirstName:     inp.FirstName,
		LastName:      inp.LastName,
		Email:         inp.Email,
		Phone:         inp.Phone,
		WalletAddress: inp.WalletAddress,
		CreatedAt:     time.Now(),
	}
	var walletArg interface{}
	if inp.WalletAddress != "" {
		walletArg = inp.WalletAddress
	}

	_, err := s.db.Exec(`
        INSERT INTO users (id, wallet_address, username, first_name, last_name, email, phone, password_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		u.ID, walletArg, u.Username, u.FirstName, u.LastName, u.Email, u.Phone, inp.PasswordHash, u.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}

// GetByUsername — для логина; возвращает хэш пароля тоже
func (s *Store) GetByUsername(username string) (*User, string, error) {
	u := &User{}
	var passwordHash string
	err := s.db.QueryRow(`
        SELECT id, COALESCE(wallet_address,''), username, first_name, last_name,
               COALESCE(email,''), COALESCE(phone,''), display_name, created_at, COALESCE(password_hash,'')
        FROM users WHERE username = $1`,
		username,
	).Scan(&u.ID, &u.WalletAddress, &u.Username, &u.FirstName, &u.LastName,
		&u.Email, &u.Phone, &u.DisplayName, &u.CreatedAt, &passwordHash)
	if err != nil {
		return nil, "", err
	}
	return u, passwordHash, nil
}

func (s *Store) GetByWallet(walletAddress string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		`SELECT id, COALESCE(wallet_address,''), COALESCE(username,''), first_name, last_name,
		        COALESCE(email,''), COALESCE(phone,''), display_name, created_at
		 FROM users WHERE wallet_address = $1`,
		walletAddress,
	).Scan(&u.ID, &u.WalletAddress, &u.Username, &u.FirstName, &u.LastName,
		&u.Email, &u.Phone, &u.DisplayName, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
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
