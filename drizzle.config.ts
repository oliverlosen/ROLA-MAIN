import { defineConfig } from "drizzle-kit";
import path from "path";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: path.resolve(process.cwd(), process.env.SQLITE_DB_PATH || "data/rola.sqlite"),
  },
});
