import "@/db/envConfig";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from './schema';
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.SQLITE_URL!,
  authToken: process.env.SQLITE_AUTH_TOKEN
});

export const db = drizzle(client, { schema });