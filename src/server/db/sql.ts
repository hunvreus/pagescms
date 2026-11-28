import type { Client, InValue } from '@libsql/client'
import type { AnyD1Database } from 'drizzle-orm/d1'
import type { Database } from '#/server/db/core'

export function repositoryAddressQuery(
  source: string,
  owner: string,
  repo: string,
) {
  return {
    sql: '(SELECT repository_id FROM repository_address WHERE source = ? AND owner = ? AND repo = ?)',
    args: [source, owner.toLowerCase(), repo.toLowerCase()],
  }
}

export async function first<T>(
  database: Database,
  sql: string,
  args: readonly InValue[],
): Promise<T | undefined> {
  const client = (database as Database & { $client: Client | AnyD1Database })
    .$client
  if ('prepare' in client)
    return (
      (await client
        .prepare(sql)
        .bind(...args)
        .first<T>()) ?? undefined
    )
  const result = await client.execute({ sql, args: [...args] })
  return result.rows[0] as T | undefined
}

export async function all<T>(
  database: Database,
  sql: string,
  args: readonly InValue[],
): Promise<T[]> {
  const client = (database as Database & { $client: Client | AnyD1Database })
    .$client
  if ('prepare' in client)
    return (
      await client
        .prepare(sql)
        .bind(...args)
        .all<T>()
    ).results
  return (await client.execute({ sql, args: [...args] })).rows as T[]
}
