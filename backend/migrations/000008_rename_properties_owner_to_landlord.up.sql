ALTER TABLE properties RENAME COLUMN owner_wallet TO landlord_id;

DROP INDEX IF EXISTS idx_properties_owner;
CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
