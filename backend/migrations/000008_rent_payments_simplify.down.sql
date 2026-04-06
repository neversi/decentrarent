DROP INDEX IF EXISTS idx_rent_payments_order;
DROP TABLE IF EXISTS rent_payments;

CREATE TABLE rent_payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    paid_by TEXT NOT NULL REFERENCES users(id),
    amount BIGINT NOT NULL,
    tx_hash TEXT NOT NULL DEFAULT '',
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rent_payments_order ON rent_payments(order_id);
