ALTER TABLE properties RENAME COLUMN landlord_id TO owner_wallet;

DROP INDEX IF EXISTS idx_properties_landlord;
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_wallet);
