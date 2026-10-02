import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/database/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
})
