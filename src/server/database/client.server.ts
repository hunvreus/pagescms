import { createClient } from '@libsql/client'
import { drizzle as drizzleLibSql } from 'drizzle-orm/libsql'

import type { Client } from '@libsql/client'
import type { Database, DatabaseSource } from './core.server'

import * as schema from './schema'
import { registerAtomicExecutor } from './core.server'

export * from './core.server'

export interface DatabaseOptions {
  url: string
  authToken?: string
}

export function createDatabase({ url, authToken }: DatabaseOptions): Database {
  if (!url.trim()) throw new Error('A database URL is required')
  if (url.startsWith('file:') && authToken) {
    throw new Error('Local SQLite databases do not accept an auth token')
  }

  return createLibSqlDatabase(createClient({ url, authToken }))
}

export function createLibSqlDatabase(client: Client): Database {
  const database = drizzleLibSql(client, { schema })
  registerAtomicExecutor(database, async (statements) => {
    const results = await client.batch(
      statements.map((statement) => ({
        sql: statement.sql,
        args: statement.args ? [...statement.args] : [],
      })),
      'write',
    )
    return results.map((result) => ({
      rowsAffected: result.rowsAffected,
      rows: result.rows,
    }))
  })
  return database
}

export function createDatabaseFromSource(source: DatabaseSource): Database {
  if (source.kind !== 'libsql') {
    throw new Error('D1 bindings require the Cloudflare database adapter')
  }
  return createDatabase(source)
}
