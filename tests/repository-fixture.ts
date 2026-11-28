import { ensureRepositoryIdentity } from '#/server/access/repository-identity'
import type { Database } from '#/server/db/client'

type Address = { owner: string; repo: string; source?: string }
export async function repositoryRows<T extends Address>(
  database: Database,
  rows: T[],
): Promise<(T & { repositoryId: number })[]>
export async function repositoryRows<T extends Address>(
  database: Database,
  rows: T,
): Promise<T & { repositoryId: number }>
export async function repositoryRows<T extends Address>(
  database: Database,
  rows: T | T[],
) {
  if (Array.isArray(rows))
    return Promise.all(rows.map((row) => repositoryRows(database, row)))
  return {
    ...rows,
    repositoryId: (await ensureRepositoryIdentity(database, rows)).id,
  }
}
