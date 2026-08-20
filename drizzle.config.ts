import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Drizzle migration commands')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/database/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: { url: databaseUrl },
})
