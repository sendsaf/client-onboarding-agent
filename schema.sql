-- Client Onboarding Agent Database Schema

-- Conversations table: stores high-level conversation metadata
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    client_name TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    phase_completed INTEGER DEFAULT 0,
    estimated_total INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active', -- active, qualified, completed, abandoned, archived
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Messages table: stores all conversation messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL, -- user, assistant, system
    content TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Conversation data: stores structured agent state as JSON
CREATE TABLE IF NOT EXISTS conversation_data (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL UNIQUE,
    service_types TEXT, -- JSON array of selected services
    requirements TEXT, -- JSON object of requirements
    budget INTEGER,
    timeline TEXT, -- rush, normal, flexible
    complexity TEXT, -- simple, medium, complex
    selected_addons TEXT, -- JSON array of addon names
    json_data TEXT, -- Full state backup as JSON
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_conversations_email ON conversations(email);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
