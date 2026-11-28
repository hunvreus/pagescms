import { ensureRepositoryIdentity } from '#/server/access/repository-identity'
import { first } from '#/server/db/sql'
import type { Database } from '#/server/db/client'

export async function recordRepositoryOpened(
  database: Database,
  owner: string,
  repo: string,
  repositoryId?: number,
) {
  const now = Date.now()
  const id =
    repositoryId ??
    (await ensureRepositoryIdentity(database, { owner, repo })).id
  await first(
    database,
    'UPDATE repository SET last_opened_at = ? WHERE id = ? AND last_opened_at < ? RETURNING id',
    [now, id, now - 60_000],
  )
}
