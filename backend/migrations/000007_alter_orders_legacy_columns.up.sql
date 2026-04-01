DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'tenant_wallet'
    ) THEN
        ALTER TABLE orders RENAME COLUMN tenant_wallet TO tenant_id;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'landlord_wallet'
    ) THEN
        ALTER TABLE orders RENAME COLUMN landlord_wallet TO landlord_id;
    END IF;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_orders_escrow_address ON orders(escrow_address);
