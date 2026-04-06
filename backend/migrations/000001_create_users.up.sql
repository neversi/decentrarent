CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    wallet_address TEXT UNIQUE,
    username TEXT UNIQUE,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT,
    phone TEXT,
    password_hash TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
