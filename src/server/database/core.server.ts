import { drizzle as drizzleD1 } from 'drizzle-orm/d1'

import type { InValue } from '@libsql/client'
import type { BatchItem, BatchResponse } from 'drizzle-orm/batch'
import type { AnyD1Database } from 'drizzle-orm/d1'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

import * as schema from './schema'

export type Database = LibSQLDatabase<typeof schema>
export type DatabaseQuery = BatchItem<'sqlite'>
export type DatabaseStatement = Readonly<{
  sql: string
  args?: readonly InValue[]
}>
export type AtomicResult = Readonly<{
  rowsAffected: number
  rows: readonly unknown[]
}>
export type DatabaseSource =
  | Readonly<{ kind: 'd1'; binding: AnyD1Database }>
  | Readonly<{ kind: 'libsql'; url: string; authToken?: string }>

const atomicExecutors = new WeakMap<
  Database,
  (statements: readonly DatabaseStatement[]) => Promise<AtomicResult[]>
>()

export function registerAtomicExecutor(
  database: Database,
  execute: (
    statements: readonly DatabaseStatement[],
  ) => Promise<AtomicResult[]>,
) {
  atomicExecutors.set(database, execute)
}

export function createD1Database(binding: AnyD1Database): Database {
  // LibSQL and D1 implement the same asynchronous SQLite Drizzle surface. The
  // concrete run-result types differ, but Pages CMS never exposes them.
  const database = drizzleD1(binding, { schema }) as unknown as Database
  registerAtomicExecutor(database, async (statements) => {
    const results = await binding.batch(
      statements.map((statement) =>
        binding.prepare(statement.sql).bind(...(statement.args ?? [])),
      ),
    )
    return results.map((result) => ({
      rowsAffected: result.meta.changes,
      rows: result.results,
    }))
  })
  return database
}

export function atomicBatch<
  T extends readonly [DatabaseQuery, ...DatabaseQuery[]],
>(database: Database, queries: T): Promise<BatchResponse<T>> {
  return database.batch(queries)
}

export function executeAtomic(
  database: Database,
  statements: readonly DatabaseStatement[],
) {
  if (!statements.length) return Promise.resolve([])
  const execute = atomicExecutors.get(database)
  if (!execute) throw new Error('Database atomic executor is unavailable')
  return execute(statements)
}

export function databaseStatement(query: {
  toSQL: () => { sql: string; params: unknown[] }
}): DatabaseStatement {
  const compiled = query.toSQL()
  return { sql: compiled.sql, args: compiled.params as InValue[] }
}
