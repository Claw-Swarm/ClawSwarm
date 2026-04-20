-- ClawSwarm Database Schema
-- SQLite DDL

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,               -- UUID
  name        TEXT NOT NULL UNIQUE,           -- e.g. "backend-dev"
  role        TEXT NOT NULL DEFAULT '',       -- Role prompt
  skills      TEXT NOT NULL DEFAULT '[]',     -- JSON array of skill strings
  status      TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline')),
  created_at  INTEGER NOT NULL               -- Unix ms
);

-- Auth Tokens
CREATE TABLE IF NOT EXISTS tokens (
  id          TEXT PRIMARY KEY,               -- UUID
  agent_id    TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,           -- ocs_xxx (plaintext, hashed in production)
  description TEXT NOT NULL DEFAULT '',
  revoked     INTEGER NOT NULL DEFAULT 0,     -- 0=active, 1=revoked
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Rooms (group chats)
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,               -- UUID
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL               -- Unix ms
);

-- Room Members (Agent membership)
CREATE TABLE IF NOT EXISTS room_members (
  room_id     TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (room_id, agent_id),
  FOREIGN KEY (room_id)  REFERENCES rooms(id)  ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,               -- msg_<uuid>
  room_id     TEXT NOT NULL,
  from_id     TEXT NOT NULL,                  -- "human" or agent name
  from_type   TEXT NOT NULL CHECK(from_type IN ('human','agent')),
  content     TEXT NOT NULL,
  mentions    TEXT NOT NULL DEFAULT '[]',     -- JSON array of agent names
  timestamp   INTEGER NOT NULL,              -- Unix ms
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_room_ts ON messages(room_id, timestamp);

-- Requirement Marks (/new-task)
CREATE TABLE IF NOT EXISTS requirement_marks (
  id          TEXT PRIMARY KEY,               -- UUID
  room_id     TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',       -- task label from /new-task <label>
  marked_at   INTEGER NOT NULL,              -- Unix ms
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_req_marks_room_ts ON requirement_marks(room_id, marked_at);

ALTER TABLE agents ADD COLUMN nickname TEXT NOT NULL DEFAULT '' ;
ALTER TABLE agents ADD COLUMN icon TEXT NOT NULL DEFAULT '' ;
