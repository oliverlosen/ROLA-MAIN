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

CREATE TABLE IF NOT EXISTS crm_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  owner_id INTEGER REFERENCES users(id),
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  job_title TEXT,
  phone TEXT,
  notes TEXT,
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  start_date TEXT,
  end_date TEXT,
  progress_override INTEGER,
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL REFERENCES countries(id),
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  title_id INTEGER REFERENCES titles(id),
  studio_id INTEGER REFERENCES studios(id),
  account_id INTEGER REFERENCES crm_accounts(id),
  campaign_id INTEGER REFERENCES crm_campaigns(id),
  primary_contact_id INTEGER REFERENCES crm_contacts(id),
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
  planned_start_date TEXT,
  planned_end_date TEXT,
  progress_override INTEGER,
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
  start_date TEXT,
  end_date TEXT,
  progress_override INTEGER,
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
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

CREATE TABLE IF NOT EXISTS email_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,
  provider_account_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_type TEXT,
  scopes TEXT,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'connected',
  last_sync_at INTEGER,
  last_error TEXT,
  webhook_id TEXT,
  webhook_resource TEXT,
  webhook_expires_at INTEGER,
  disconnected_at INTEGER,
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS email_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id),
  provider_thread_id TEXT NOT NULL,
  provider_conversation_id TEXT,
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  last_message_at INTEGER,
  last_inbound_at INTEGER,
  last_outbound_at INTEGER,
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id),
  thread_id INTEGER NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL,
  internet_message_id TEXT,
  direction TEXT NOT NULL,
  sender_email TEXT,
  sender_name TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,
  in_reply_to TEXT,
  "references" TEXT,
  sent_at INTEGER,
  synced_at INTEGER DEFAULT ${SQLITE_NOW},
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS email_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT
);

CREATE TABLE IF NOT EXISTS email_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  linked_by INTEGER REFERENCES users(id),
  created_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS email_sync_cursors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  cursor_type TEXT NOT NULL,
  cursor_value TEXT,
  payload TEXT,
  expires_at INTEGER,
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE TABLE IF NOT EXISTS automation_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_code TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  execution_id INTEGER REFERENCES executions(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  suggested_action TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  dedupe_key TEXT NOT NULL,
  payload TEXT,
  first_triggered_at INTEGER DEFAULT ${SQLITE_NOW},
  last_triggered_at INTEGER DEFAULT ${SQLITE_NOW},
  last_notified_at INTEGER,
  resolved_at INTEGER,
  created_at INTEGER DEFAULT ${SQLITE_NOW},
  updated_at INTEGER DEFAULT ${SQLITE_NOW}
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS countries_name_unique ON countries (name);
CREATE UNIQUE INDEX IF NOT EXISTS countries_code_unique ON countries (code);
CREATE UNIQUE INDEX IF NOT EXISTS brands_name_unique ON brands (name);
CREATE UNIQUE INDEX IF NOT EXISTS titles_name_unique ON titles (name);
CREATE UNIQUE INDEX IF NOT EXISTS studios_name_unique ON studios (name);
CREATE UNIQUE INDEX IF NOT EXISTS crm_accounts_name_unique ON crm_accounts (name);
CREATE UNIQUE INDEX IF NOT EXISTS automation_alerts_dedupe_key_unique ON automation_alerts (dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_provider_account_unique ON email_accounts (provider, provider_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_threads_account_thread_unique ON email_threads (account_id, provider_thread_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_account_message_unique ON email_messages (account_id, provider_message_id);
CREATE INDEX IF NOT EXISTS crm_contacts_account_idx ON crm_contacts (account_id);
CREATE INDEX IF NOT EXISTS crm_campaigns_account_idx ON crm_campaigns (account_id);
CREATE INDEX IF NOT EXISTS automation_alerts_execution_idx ON automation_alerts (execution_id, status);
CREATE INDEX IF NOT EXISTS automation_alerts_task_idx ON automation_alerts (task_id, status);
CREATE INDEX IF NOT EXISTS automation_alerts_campaign_idx ON automation_alerts (campaign_id, status);
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

function hasColumn(tableName: string, columnName: string) {
  const rows = client.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return rows.some((row) => row.name === columnName);
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  if (!hasColumn(tableName, columnName)) {
    client.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

ensureColumn("executions", "account_id", "account_id INTEGER REFERENCES crm_accounts(id)");
ensureColumn("executions", "campaign_id", "campaign_id INTEGER REFERENCES crm_campaigns(id)");
ensureColumn("executions", "primary_contact_id", "primary_contact_id INTEGER REFERENCES crm_contacts(id)");
ensureColumn("executions", "planned_start_date", "planned_start_date TEXT");
ensureColumn("executions", "planned_end_date", "planned_end_date TEXT");
ensureColumn("executions", "progress_override", "progress_override INTEGER");
ensureColumn("tasks", "updated_at", "updated_at INTEGER");
ensureColumn("tasks", "start_date", "start_date TEXT");
ensureColumn("tasks", "end_date", "end_date TEXT");
ensureColumn("tasks", "progress_override", "progress_override INTEGER");
ensureColumn("crm_campaigns", "progress_override", "progress_override INTEGER");
client.exec("UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL");
client.exec(`
CREATE INDEX IF NOT EXISTS executions_account_idx ON executions (account_id);
CREATE INDEX IF NOT EXISTS executions_campaign_idx ON executions (campaign_id);
`);

export const sqlite = client;
export const db = drizzle(client, { schema });
