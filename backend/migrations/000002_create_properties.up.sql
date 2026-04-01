CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    landlord_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL,
    price BIGINT NOT NULL,
    token_mint TEXT NOT NULL DEFAULT 'SOL',
    period_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'listed',
    verification_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
