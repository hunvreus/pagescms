import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

export interface DatabaseOptions {
  connectionString: string
  maxConnections?: number
}

export function createDatabase({
  connectionString,
  maxConnections = 5,
}: DatabaseOptions) {
  if (!connectionString.trim()) {
    throw new Error('A database connection string is required')
  }
  if (!Number.isInteger(maxConnections) || maxConnections < 1) {
    throw new Error('Database maxConnections must be a positive integer')
  }

  const client = postgres(connectionString, {
    fetch_types: false,
    max: maxConnections,
    prepare: true,
  })

  return drizzle(client, { schema })
}

export type Database = ReturnType<typeof createDatabase>
