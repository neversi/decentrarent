CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    wallet_address TEXT UNIQUE,
    username TEXT UNIQUE,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT UNIQUE,
    phone TEXT,
    password_hash TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    user_type     TEXT NOT NULL,
    role          TEXT NOT NULL,
    private_key   TEXT NOT NULL DEFAULT ''
);
