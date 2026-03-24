import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import * as schema from "@shared/schema";

const SQLITE_NOW = "(cast((julianday('now') - 2440587.5) * 86400000 as integer))";

const bootstrapSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer'
);

CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS studios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL REFERENCES countries(id),
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  title_id INTEGER REFERENCES titles(id),
  studio_id INTEGER REFERENCES studios(id),
  execution_date TEXT NOT NULL,
  execution_type TEXT NOT NULL,
  media_value_local TEXT NOT NULL,
  local_currency TEXT NOT NULL,
  fx_rate_used TEXT NOT NULL DEFAULT '1',
  fx_source TEXT,
  fx_date TEXT,
  media_value_usd TEXT NOT NULL,
  notes TEXT,
  owner_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  due_date TEXT,
  has_clipping INTEGER DEFAULT 0,
  has_photos INTEGER DEFAULT 0,
  has_links INTEGER DEFAULT 0,
  has_invoice INTEGER DEFAULT 0,
  has_contract INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW},
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  url TEXT,
  file_path TEXT,
  description TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at INTEGER DEFAULT ${SQLITE_NOW},
  notes TEXT
);

CREATE TABLE IF NOT EXISTS fx_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  rate TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  due_date TEXT,
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  actor_id INTEGER REFERENCES users(id),
  execution_id INTEGER REFERENCES executions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  read_at INTEGER,
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER REFERENCES executions(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'execution',
  name TEXT,
  country_id INTEGER REFERENCES countries(id),
  title_id INTEGER REFERENCES titles(id),
  studio_id INTEGER REFERENCES studios(id),
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT DEFAULT 'member',
  last_read_at INTEGER DEFAULT ${SQLITE_NOW},
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS message_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  execution_id INTEGER REFERENCES executions(id),
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS countries_name_unique ON countries (name);
CREATE UNIQUE INDEX IF NOT EXISTS countries_code_unique ON countries (code);
CREATE UNIQUE INDEX IF NOT EXISTS brands_name_unique ON brands (name);
CREATE UNIQUE INDEX IF NOT EXISTS titles_name_unique ON titles (name);
CREATE UNIQUE INDEX IF NOT EXISTS studios_name_unique ON studios (name);
`;

export const sqliteDbPath = path.resolve(
  process.cwd(),
  process.env.SQLITE_DB_PATH || "data/rola.sqlite",
);

mkdirSync(path.dirname(sqliteDbPath), { recursive: true });

const client = new Database(sqliteDbPath);
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");
client.exec(bootstrapSql);

export const sqlite = client;
export const db = drizzle(client, { schema });
