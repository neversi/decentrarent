CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL,
    landlord_id TEXT NOT NULL,
    loaner_id TEXT NOT NULL,
    last_message TEXT,
    last_message_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(property_id, loaner_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_users
    ON conversations(landlord_id, loaner_id);
