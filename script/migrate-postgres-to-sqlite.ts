import { Pool } from "pg";
import { db as localDb, sqlite, sqliteDbPath } from "../server/db";
import {
  assets,
  brands,
  conversationMembers,
  conversations,
  countries,
  executions,
  fxDefaults,
  messageLinks,
  messages,
  notifications,
  statusHistory,
  studios,
  tasks,
  titles,
  users,
} from "../shared/schema";

type PgRow = Record<string, unknown>;

type MigrationTable<TTable> = {
  name: string;
  table: TTable;
  normalize?: (row: PgRow) => PgRow;
};

const tables: MigrationTable<any>[] = [
  { name: "users", table: users },
  { name: "countries", table: countries },
  { name: "brands", table: brands },
  { name: "titles", table: titles },
  { name: "studios", table: studios },
  { name: "executions", table: executions, normalize: normalizeExecutions },
  { name: "assets", table: assets, normalize: normalizeAssets },
  { name: "status_history", table: statusHistory, normalize: normalizeStatusHistory },
  { name: "fx_defaults", table: fxDefaults },
  { name: "tasks", table: tasks, normalize: normalizeTasks },
  { name: "notifications", table: notifications, normalize: normalizeNotifications },
  { name: "conversations", table: conversations, normalize: normalizeConversations },
  { name: "conversation_members", table: conversationMembers, normalize: normalizeConversationMembers },
  { name: "messages", table: messages, normalize: normalizeMessages },
  { name: "message_links", table: messageLinks, normalize: normalizeMessageLinks },
];

const deleteOrder = [
  "message_links",
  "messages",
  "conversation_members",
  "conversations",
  "notifications",
  "tasks",
  "fx_defaults",
  "status_history",
  "assets",
  "executions",
  "studios",
  "titles",
  "brands",
  "countries",
  "users",
] as const;

function normalizeTimestamp(value: unknown) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value.replace(" ", "T") + "Z");
    }
    return new Date(value);
  }
  return new Date(value as number);
}

function withTimestamps(row: PgRow, fields: string[]) {
  const normalized: PgRow = { ...row };
  for (const field of fields) {
    if (field in normalized) {
      normalized[field] = normalizeTimestamp(normalized[field]);
    }
  }
  return normalized;
}

function normalizeExecutions(row: PgRow) {
  return withTimestamps(row, ["created_at", "updated_at"]);
}

function normalizeAssets(row: PgRow) {
  return withTimestamps(row, ["uploaded_at"]);
}

function normalizeStatusHistory(row: PgRow) {
  return withTimestamps(row, ["changed_at"]);
}

function normalizeTasks(row: PgRow) {
  return withTimestamps(row, ["created_at"]);
}

function normalizeNotifications(row: PgRow) {
  return withTimestamps(row, ["read_at", "created_at"]);
}

function normalizeConversations(row: PgRow) {
  return withTimestamps(row, ["created_at"]);
}

function normalizeConversationMembers(row: PgRow) {
  return withTimestamps(row, ["last_read_at", "created_at"]);
}

function normalizeMessages(row: PgRow) {
  return withTimestamps(row, ["created_at"]);
}

function normalizeMessageLinks(row: PgRow) {
  return withTimestamps(row, ["created_at"]);
}

async function clearLocalDatabase() {
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    for (const tableName of deleteOrder) {
      sqlite.prepare(`DELETE FROM ${tableName}`).run();
    }
    sqlite.prepare("DELETE FROM sqlite_sequence").run();
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set to import the existing Postgres data");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log(`Importing Postgres data into ${sqliteDbPath}`);
    await clearLocalDatabase();

    for (const { name, table, normalize } of tables) {
      const { rows } = await pool.query(`SELECT * FROM ${name} ORDER BY id ASC`);
      console.log(`Copying ${name}: ${rows.length} row(s)`);

      for (const row of rows) {
        const data = normalize ? normalize(row) : row;
        await localDb.insert(table).values(data);
      }
    }

    console.log("Migration completed successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
