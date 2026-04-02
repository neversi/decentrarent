CREATE TABLE IF NOT EXISTS order_status_history (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL DEFAULT '',
    to_status TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);

CREATE TABLE IF NOT EXISTS rent_payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    paid_by TEXT NOT NULL REFERENCES users(id),
    amount BIGINT NOT NULL,
    tx_hash TEXT NOT NULL DEFAULT '',
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rent_payments_order ON rent_payments(order_id);
