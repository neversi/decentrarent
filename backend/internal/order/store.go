package order

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

// ─── Migrate ────────────────────────────────────────────────────────

func (s *Store) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS orders (
			id                TEXT PRIMARY KEY,
			property_id       TEXT NOT NULL REFERENCES properties(id),
			tenant_id         TEXT NOT NULL REFERENCES users(id),
			landlord_id       TEXT NOT NULL REFERENCES users(id),
			deposit_amount    BIGINT NOT NULL DEFAULT 0,
			rent_amount       BIGINT NOT NULL DEFAULT 0,
			token_mint        TEXT NOT NULL DEFAULT 'SOL',
			escrow_status     TEXT NOT NULL DEFAULT 'awaiting_signatures',
			escrow_address    TEXT NOT NULL DEFAULT '',
			tenant_signed     BOOLEAN NOT NULL DEFAULT FALSE,
			landlord_signed   BOOLEAN NOT NULL DEFAULT FALSE,
			sign_deadline     TIMESTAMP NOT NULL,
			rent_start_date   TIMESTAMP NOT NULL,
			rent_end_date     TIMESTAMP NOT NULL,
			dispute_reason    TEXT NOT NULL DEFAULT '',
			created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_landlord ON orders(landlord_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_property ON orders(property_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(escrow_status)`,

		`CREATE TABLE IF NOT EXISTS order_status_history (
			id          TEXT PRIMARY KEY,
			order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
			from_status TEXT NOT NULL DEFAULT '',
			to_status   TEXT NOT NULL,
			changed_by  TEXT NOT NULL,
			reason      TEXT NOT NULL DEFAULT '',
			created_at  TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id)`,

		`CREATE TABLE IF NOT EXISTS rent_payments (
			id           TEXT PRIMARY KEY,
			order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
			paid_by      TEXT NOT NULL REFERENCES users(id),
			amount       BIGINT NOT NULL,
			tx_hash      TEXT NOT NULL DEFAULT '',
			period_start TIMESTAMP NOT NULL,
			period_end   TIMESTAMP NOT NULL,
			created_at   TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_rent_payments_order ON rent_payments(order_id)`,
	}

	// Rename columns for existing databases (safe to fail if already renamed or table is new)
	renames := []string{
		`ALTER TABLE orders RENAME COLUMN tenant_wallet TO tenant_id`,
		`ALTER TABLE orders RENAME COLUMN landlord_wallet TO landlord_id`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT ''`,
		`CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_escrow_address ON orders(escrow_address)`,
	}

	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}

	for _, q := range renames {
		s.db.Exec(q) // ignore errors — column may already be renamed or table is fresh
	}

	return nil
}

// ─── Create ─────────────────────────────────────────────────────────

func (s *Store) Create(o *Order) (*Order, error) {
	o.ID = uuid.New().String()
	o.EscrowStatus = StatusNew
	o.TenantSigned = false
	o.LandlordSigned = false
	o.CreatedAt = time.Now()
	o.UpdatedAt = time.Now()

	_, err := s.db.Exec(
		`INSERT INTO orders
			(id, conversation_id, property_id, tenant_id, landlord_id, created_by,
			 deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
			 tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
			 dispute_reason, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		o.ID, o.ConversationID, o.PropertyID, o.TenantID, o.LandlordID, o.CreatedBy,
		o.DepositAmount, o.RentAmount, o.TokenMint, o.EscrowStatus, o.EscrowAddress,
		o.TenantSigned, o.LandlordSigned, o.SignDeadline, o.RentStartDate, o.RentEndDate,
		o.DisputeReason, o.CreatedAt, o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	s.addHistory(o.ID, "", StatusNew, o.CreatedBy, "order created")

	return o, nil
}

// ─── GetByID ────────────────────────────────────────────────────────

func (s *Store) GetByID(id string) (*Order, error) {
	o := &Order{}
	err := s.db.QueryRow(
		`SELECT id, conversation_id, property_id, tenant_id, landlord_id, created_by,
		        deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
		        tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
		        dispute_reason, created_at, updated_at
		 FROM orders WHERE id = $1`, id,
	).Scan(
		&o.ID, &o.ConversationID, &o.PropertyID, &o.TenantID, &o.LandlordID, &o.CreatedBy,
		&o.DepositAmount, &o.RentAmount, &o.TokenMint, &o.EscrowStatus, &o.EscrowAddress,
		&o.TenantSigned, &o.LandlordSigned, &o.SignDeadline, &o.RentStartDate, &o.RentEndDate,
		&o.DisputeReason, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// ─── List ───────────────────────────────────────────────────────────

func (s *Store) List(f *ListFilter) ([]Order, error) {
	query := `SELECT id, conversation_id, property_id, tenant_id, landlord_id, created_by,
	                 deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
	                 tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
	                 dispute_reason, created_at, updated_at
	          FROM orders WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if f.TenantID != "" {
		query += fmt.Sprintf(" AND tenant_id = $%d", argIdx)
		args = append(args, f.TenantID)
		argIdx++
	}
	if f.LandlordID != "" {
		query += fmt.Sprintf(" AND landlord_id = $%d", argIdx)
		args = append(args, f.LandlordID)
		argIdx++
	}
	if f.PropertyID != "" {
		query += fmt.Sprintf(" AND property_id = $%d", argIdx)
		args = append(args, f.PropertyID)
		argIdx++
	}
	if f.ConversationID != "" {
		query += fmt.Sprintf(" AND conversation_id = $%d", argIdx)
		args = append(args, f.ConversationID)
		argIdx++
	}
	if f.EscrowStatus != "" {
		query += fmt.Sprintf(" AND escrow_status = $%d", argIdx)
		args = append(args, f.EscrowStatus)
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

	var orders []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(
			&o.ID, &o.ConversationID, &o.PropertyID, &o.TenantID, &o.LandlordID, &o.CreatedBy,
			&o.DepositAmount, &o.RentAmount, &o.TokenMint, &o.EscrowStatus, &o.EscrowAddress,
			&o.TenantSigned, &o.LandlordSigned, &o.SignDeadline, &o.RentStartDate, &o.RentEndDate,
			&o.DisputeReason, &o.CreatedAt, &o.UpdatedAt,
		); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

// ─── ListByParticipant — orders where user is tenant OR landlord

func (s *Store) ListByParticipant(userID string, limit, offset int) ([]Order, error) {
	query := `SELECT id, conversation_id, property_id, tenant_id, landlord_id, created_by,
	                 deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
	                 tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
	                 dispute_reason, created_at, updated_at
	          FROM orders
	          WHERE tenant_id = $1 OR landlord_id = $1
	          ORDER BY created_at DESC
	          LIMIT $2 OFFSET $3`

	rows, err := s.db.Query(query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(
			&o.ID, &o.ConversationID, &o.PropertyID, &o.TenantID, &o.LandlordID, &o.CreatedBy,
			&o.DepositAmount, &o.RentAmount, &o.TokenMint, &o.EscrowStatus, &o.EscrowAddress,
			&o.TenantSigned, &o.LandlordSigned, &o.SignDeadline, &o.RentStartDate, &o.RentEndDate,
			&o.DisputeReason, &o.CreatedAt, &o.UpdatedAt,
		); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

// ─── FindByEscrowAddress ───────────────────────────────────────────

func (s *Store) FindByEscrowAddress(escrowAddress string) (*Order, error) {
	o := &Order{}
	err := s.db.QueryRow(
		`SELECT id, conversation_id, property_id, tenant_id, landlord_id, created_by,
		        deposit_amount, rent_amount, token_mint, escrow_status, escrow_address,
		        tenant_signed, landlord_signed, sign_deadline, rent_start_date, rent_end_date,
		        dispute_reason, created_at, updated_at
		 FROM orders WHERE escrow_address = $1`, escrowAddress,
	).Scan(
		&o.ID, &o.ConversationID, &o.PropertyID, &o.TenantID, &o.LandlordID, &o.CreatedBy,
		&o.DepositAmount, &o.RentAmount, &o.TokenMint, &o.EscrowStatus, &o.EscrowAddress,
		&o.TenantSigned, &o.LandlordSigned, &o.SignDeadline, &o.RentStartDate, &o.RentEndDate,
		&o.DisputeReason, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// ─── UpdateStatus ───────────────────────────────────────────────────

func (s *Store) UpdateStatus(id, status, changedBy, reason string) error {
	old, err := s.GetByID(id)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(
		`UPDATE orders SET escrow_status = $1, updated_at = $2 WHERE id = $3`,
		status, time.Now(), id,
	)
	if err != nil {
		return err
	}

	s.addHistory(id, old.EscrowStatus, status, changedBy, reason)
	return nil
}

// ─── UpdateSignature ────────────────────────────────────────────────

func (s *Store) UpdateTenantSigned(id string, signed bool) error {
	_, err := s.db.Exec(
		`UPDATE orders SET tenant_signed = $1, updated_at = $2 WHERE id = $3`,
		signed, time.Now(), id,
	)
	return err
}

func (s *Store) UpdateLandlordSigned(id string, signed bool) error {
	_, err := s.db.Exec(
		`UPDATE orders SET landlord_signed = $1, updated_at = $2 WHERE id = $3`,
		signed, time.Now(), id,
	)
	return err
}

// ─── UpdateDisputeReason ────────────────────────────────────────────

func (s *Store) UpdateDisputeReason(id, reason string) error {
	_, err := s.db.Exec(
		`UPDATE orders SET dispute_reason = $1, updated_at = $2 WHERE id = $3`,
		reason, time.Now(), id,
	)
	return err
}

// ─── Update (partial) ───────────────────────────────────────────────

func (s *Store) Update(id string, sets map[string]interface{}) error {
	if len(sets) == 0 {
		return nil
	}

	parts := []string{}
	args := []interface{}{}
	argIdx := 1

	for col, val := range sets {
		parts = append(parts, fmt.Sprintf("%s = $%d", col, argIdx))
		args = append(args, val)
		argIdx++
	}

	parts = append(parts, fmt.Sprintf("updated_at = $%d", argIdx))
	args = append(args, time.Now())
	argIdx++

	args = append(args, id)
	query := fmt.Sprintf("UPDATE orders SET %s WHERE id = $%d", strings.Join(parts, ", "), argIdx)

	_, err := s.db.Exec(query, args...)
	return err
}

// ─── GetHistory ─────────────────────────────────────────────────────

func (s *Store) GetHistory(orderID string) ([]StatusHistory, error) {
	rows, err := s.db.Query(
		`SELECT id, order_id, from_status, to_status, changed_by, reason, created_at
		 FROM order_status_history
		 WHERE order_id = $1
		 ORDER BY created_at ASC`, orderID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []StatusHistory
	for rows.Next() {
		var h StatusHistory
		if err := rows.Scan(&h.ID, &h.OrderID, &h.FromStatus, &h.ToStatus, &h.ChangedBy, &h.Reason, &h.CreatedAt); err != nil {
			return nil, err
		}
		history = append(history, h)
	}
	return history, nil
}

// ─── AddRentPayment ─────────────────────────────────────────────────

func (s *Store) AddRentPayment(p *RentPayment) (*RentPayment, error) {
	p.ID = uuid.New().String()
	p.CreatedAt = time.Now()

	_, err := s.db.Exec(
		`INSERT INTO rent_payments (id, order_id, paid_by, amount, tx_hash, period_start, period_end, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		p.ID, p.OrderID, p.PaidBy, p.Amount, p.TxHash, p.PeriodStart, p.PeriodEnd, p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// ─── GetRentPayments ────────────────────────────────────────────────

func (s *Store) GetRentPayments(orderID string) ([]RentPayment, error) {
	rows, err := s.db.Query(
		`SELECT id, order_id, paid_by, amount, tx_hash, period_start, period_end, created_at
		 FROM rent_payments
		 WHERE order_id = $1
		 ORDER BY period_start ASC`, orderID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payments []RentPayment
	for rows.Next() {
		var p RentPayment
		if err := rows.Scan(&p.ID, &p.OrderID, &p.PaidBy, &p.Amount, &p.TxHash, &p.PeriodStart, &p.PeriodEnd, &p.CreatedAt); err != nil {
			return nil, err
		}
		payments = append(payments, p)
	}
	return payments, nil
}

// ─── helpers ────────────────────────────────────────────────────────

func (s *Store) addHistory(orderID, from, to, changedBy, reason string) {
	s.db.Exec(
		`INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, reason, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		uuid.New().String(), orderID, from, to, changedBy, reason, time.Now(),
	)
}
