import { sql } from 'drizzle-orm'
import { repositoryTable } from './database/schema'
import type { Database } from './database/client.server'

const writes = new WeakMap<
  Database,
  Map<string, { at: number; pending: Promise<void> }>
>()
const interval = 60_000

export async function recordRepositoryOpened(
  database: Database,
  owner: string,
  repo: string,
) {
  let recent = writes.get(database)
  if (!recent) {
    recent = new Map()
    writes.set(database, recent)
  }
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`
  const now = Date.now()
  const existing = recent.get(key)
  if (existing && now - existing.at < interval) return existing.pending
  const pending = (async () => {
    const timestamp = new Date(now)
    await database
      .insert(repositoryTable)
      .values({
        source: 'github.com',
        owner: owner.toLowerCase(),
        repo: repo.toLowerCase(),
        lastOpenedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [
          repositoryTable.source,
          repositoryTable.owner,
          repositoryTable.repo,
        ],
        set: { lastOpenedAt: timestamp },
        setWhere: sql`${repositoryTable.lastOpenedAt} is null or ${repositoryTable.lastOpenedAt} < ${new Date(now - interval).getTime()}`,
      })
  })()
  while (recent.size >= 256) recent.delete(recent.keys().next().value!)
  const entry = { at: now, pending }
  recent.set(key, entry)
  try {
    await pending
  } catch (error) {
    if (recent.get(key) === entry) recent.delete(key)
    throw error
  }
}
