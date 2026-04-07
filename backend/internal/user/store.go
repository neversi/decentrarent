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

type CreateUserInput struct {
	Username      string
	FirstName     string
	LastName      string
	Email         string
	Phone         string
	PasswordHash  string
	WalletAddress string
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (s *Store) CreateByCredentials(inp CreateUserInput) (*User, error) {
	displayName := inp.Username // default display_name to username
	u := &User{
		ID:            uuid.New().String(),
		Username:      inp.Username,
		FirstName:     inp.FirstName,
		LastName:      inp.LastName,
		Email:         inp.Email,
		Phone:         inp.Phone,
		DisplayName:   displayName,
		WalletAddress: inp.WalletAddress,
		CreatedAt:     time.Now(),
	}

	_, err := s.db.Exec(`
        INSERT INTO users (id, wallet_address, username, first_name, last_name, email, phone, password_hash, display_name, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		u.ID, nullIfEmpty(inp.WalletAddress), u.Username, u.FirstName, u.LastName,
		nullIfEmpty(inp.Email), nullIfEmpty(inp.Phone), inp.PasswordHash, displayName, u.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) GetIsAdmin(id string) (bool, error) {
	var isAdmin bool
	err := s.db.QueryRow(`SELECT is_admin FROM users WHERE id = $1`, id).Scan(&isAdmin)
	return isAdmin, err
}

// GetByUsername — для логина; возвращает хэш пароля тоже
func (s *Store) GetByUsername(username string) (*User, string, error) {
	u := &User{}
	var passwordHash string
	err := s.db.QueryRow(`
        SELECT id, COALESCE(wallet_address,''), username, first_name, last_name,
               COALESCE(email,''), COALESCE(phone,''), display_name, is_admin, created_at, COALESCE(password_hash,'')
        FROM users WHERE username = $1`,
		username,
	).Scan(&u.ID, &u.WalletAddress, &u.Username, &u.FirstName, &u.LastName,
		&u.Email, &u.Phone, &u.DisplayName, &u.IsAdmin, &u.CreatedAt, &passwordHash)
	if err != nil {
		return nil, "", err
	}
	return u, passwordHash, nil
}

func (s *Store) GetByWallet(walletAddress string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		`SELECT id, COALESCE(wallet_address,''), COALESCE(username,''), first_name, last_name,
		        COALESCE(email,''), COALESCE(phone,''), display_name, is_admin, created_at
		 FROM users WHERE wallet_address = $1`,
		walletAddress,
	).Scan(&u.ID, &u.WalletAddress, &u.Username, &u.FirstName, &u.LastName,
		&u.Email, &u.Phone, &u.DisplayName, &u.IsAdmin, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) UpsertByWallet(walletAddress string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		"SELECT id, wallet_address, display_name, is_admin, created_at FROM users WHERE wallet_address = $1",
		walletAddress,
	).Scan(&u.ID, &u.WalletAddress, &u.DisplayName, &u.IsAdmin, &u.CreatedAt)

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
		`SELECT id, COALESCE(wallet_address,''), COALESCE(username,''), first_name, last_name,
		        COALESCE(email,''), COALESCE(phone,''), display_name, is_admin, created_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.WalletAddress, &u.Username, &u.FirstName, &u.LastName,
		&u.Email, &u.Phone, &u.DisplayName, &u.IsAdmin, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

type UpdateProfileInput struct {
	DisplayName string `json:"display_name"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
}

func (s *Store) UpdateProfile(id string, inp UpdateProfileInput) (*User, error) {
	_, err := s.db.Exec(`
		UPDATE users SET display_name = $2, first_name = $3, last_name = $4,
		                 email = NULLIF($5,''), phone = NULLIF($6,'')
		WHERE id = $1`,
		id, inp.DisplayName, inp.FirstName, inp.LastName, inp.Email, inp.Phone,
	)
	if err != nil {
		return nil, err
	}
	return s.GetByID(id)
}
