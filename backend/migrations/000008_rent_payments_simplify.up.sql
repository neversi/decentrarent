DROP INDEX IF EXISTS idx_rent_payments_order;
DROP TABLE IF EXISTS rent_payments;

CREATE TABLE rent_payments (
    id          TEXT PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    paid_at     TIMESTAMP NOT NULL,
    transaction TEXT NOT NULL,
    paid_amount BIGINT NOT NULL
);

CREATE INDEX idx_rent_payments_order ON rent_payments(order_id);
