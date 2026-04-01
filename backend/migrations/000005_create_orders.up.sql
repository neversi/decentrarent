CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL DEFAULT '',
    property_id TEXT NOT NULL REFERENCES properties(id),
    tenant_id TEXT NOT NULL REFERENCES users(id),
    landlord_id TEXT NOT NULL REFERENCES users(id),
    created_by TEXT NOT NULL DEFAULT '',
    deposit_amount BIGINT NOT NULL DEFAULT 0,
    rent_amount BIGINT NOT NULL DEFAULT 0,
    token_mint TEXT NOT NULL DEFAULT 'SOL',
    escrow_status TEXT NOT NULL DEFAULT 'awaiting_signatures',
    escrow_address TEXT NOT NULL DEFAULT '',
    tenant_signed BOOLEAN NOT NULL DEFAULT FALSE,
    landlord_signed BOOLEAN NOT NULL DEFAULT FALSE,
    sign_deadline TIMESTAMP NOT NULL,
    rent_start_date TIMESTAMP NOT NULL,
    rent_end_date TIMESTAMP NOT NULL,
    dispute_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_landlord ON orders(landlord_id);
CREATE INDEX IF NOT EXISTS idx_orders_property ON orders(property_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(escrow_status);
CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_orders_escrow_address ON orders(escrow_address);
