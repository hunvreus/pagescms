import "@/db/envConfig";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  driver: (process.env.SQLITE_AUTH_TOKEN && process.env.SQLITE_AUTH_TOKEN !== "")
    ? ("turso" as const)
    : (undefined as any),
  dbCredentials: {
    url: process.env.SQLITE_URL!,
    authToken: process.env.SQLITE_AUTH_TOKEN,
  }
});