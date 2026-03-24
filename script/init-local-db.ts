import { sqlite, sqliteDbPath } from "../server/db";

const tables = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row: any) => row.name);

console.log(`Local SQLite database ready: ${sqliteDbPath}`);
console.log(`Tables: ${tables.join(", ")}`);
