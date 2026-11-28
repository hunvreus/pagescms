import { ensureRepositoryIdentity } from '#/server/access/repository-identity'
import { all } from '#/server/db/sql'
import { activityRetention } from '#/lib/activity'
import type { ActivityArea, ActivityKind } from '#/lib/activity'
import type { Database, DatabaseStatement } from '#/server/db/client'
import type { activityTable } from '#/server/db/schema'
import { executeAtomic } from '#/server/db/core'
import { DEFAULT_REPOSITORY_SOURCE } from '#/server/repository/provider'

export type ActivityEvent = {
  /** Local to the database receiving this event. */
  repositoryId?: number
  source?: string
  owner: string
  repo: string
  branch: string
  kind: ActivityKind
  area: ActivityArea
  resource: string
  path: string
  previousPath?: string | null
  actor?: string | null
  actorImage?: string | null
  actorId?: string | null
  title?: string | null
  commitSha?: string | null
  origin: 'cms' | 'webhook'
  occurredAt: Date
  key?: string
}

async function eventId(event: ActivityEvent, repositoryId: number) {
  const key = JSON.stringify([
    event.source ?? DEFAULT_REPOSITORY_SOURCE,
    repositoryId,
    event.branch,
    event.key ??
      (event.commitSha ? [event.commitSha, event.path] : crypto.randomUUID()),
  ])
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
}

// This is the single persistence/capture point. Future notification publication belongs here,
// with an atomic outbox; feed retention must never govern pending delivery.
export async function recordActivity(
  database: Database,
  events: ActivityEvent[],
) {
  const groups = new Map<string, ActivityEvent[]>()
  for (const event of events) {
    if (!Number.isFinite(event.occurredAt.getTime())) continue
    const key = JSON.stringify([
      event.source ?? DEFAULT_REPOSITORY_SOURCE,
      event.repositoryId ?? [
        event.owner.toLowerCase(),
        event.repo.toLowerCase(),
      ],
      event.branch,
    ])
    const group = groups.get(key)
    if (group) group.push(event)
    else groups.set(key, [event])
  }
  for (const group of groups.values()) {
    const repositoryId =
      group[0].repositoryId ??
      (await ensureRepositoryIdentity(database, group[0])).id
    const scope = [
      group[0].source ?? DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
      group[0].branch,
    ] as const
    // The final retained set cannot contain more than 50 incoming events. Sorting before
    // insertion bounds large pushes without loading or rewriting their file contents.
    const selected = group
      .sort(
        (a, b) =>
          b.occurredAt.getTime() - a.occurredAt.getTime() ||
          b.path.localeCompare(a.path),
      )
      .slice(0, activityRetention)
    const ids = await Promise.all(
      selected.map((event) => eventId(event, repositoryId)),
    )
    const queries: DatabaseStatement[] = []
    for (const [index, event] of selected.entries()) {
      if (event.previousPath && event.commitSha) {
        queries.push({
          sql: 'DELETE FROM activity WHERE source = ? AND repository_id = ? AND branch = ? AND commit_sha = ? AND path = ?',
          args: [...scope, event.commitSha, event.previousPath],
        })
      }
      const id = ids[index]
      queries.push({
        sql: `INSERT INTO activity (id, repository_id, source, owner, repo, branch, kind, area, resource, path, previous_path, actor, actor_image, actor_id, title, commit_sha, origin, occurred_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET repository_id = excluded.repository_id, source = excluded.source, owner = excluded.owner, repo = excluded.repo, branch = excluded.branch, kind = excluded.kind, area = excluded.area, resource = excluded.resource, path = excluded.path, previous_path = excluded.previous_path, actor = excluded.actor, actor_image = excluded.actor_image, actor_id = excluded.actor_id, title = excluded.title, commit_sha = excluded.commit_sha, origin = excluded.origin, occurred_at = excluded.occurred_at
          WHERE activity.origin != 'cms' AND excluded.origin = 'cms'`,
        args: [
          id,
          repositoryId,
          event.source ?? DEFAULT_REPOSITORY_SOURCE,
          event.owner.toLowerCase(),
          event.repo.toLowerCase(),
          event.branch,
          event.kind,
          event.area,
          event.resource,
          event.path,
          event.previousPath ?? null,
          event.actor ?? null,
          event.actorImage ?? null,
          event.actorId ?? null,
          event.title ?? null,
          event.commitSha ?? null,
          event.origin,
          event.occurredAt.getTime(),
        ],
      })
      if (event.origin === 'webhook' && event.commitSha) {
        // Resolve webhook/local rename races in the same insertion batch.
        queries.push({
          sql: `DELETE FROM activity WHERE id = ? AND origin = 'webhook' AND EXISTS (SELECT 1 FROM activity renamed WHERE renamed.repository_id = ? AND renamed.branch = ? AND renamed.origin = 'cms' AND renamed.kind = 'renamed' AND renamed.commit_sha = ? AND renamed.previous_path = ?)`,
          args: [id, repositoryId, event.branch, event.commitSha, event.path],
        })
      }
    }
    // Prune in the same atomic batch as insertion; delayed events use their commit time.
    queries.push({
      sql: 'DELETE FROM activity WHERE source = ? AND repository_id = ? AND branch = ? AND id NOT IN (SELECT id FROM activity WHERE source = ? AND repository_id = ? AND branch = ? ORDER BY occurred_at DESC, id DESC LIMIT ?)',
      args: [...scope, ...scope, activityRetention],
    })
    await executeAtomic(database, queries)
  }
}

export async function readActivity(
  database: Database,
  coordinates: {
    source?: string
    owner: string
    repo: string
    branch: string
    repoId?: string
  },
) {
  const source = coordinates.source ?? DEFAULT_REPOSITORY_SOURCE
  const identity =
    coordinates.repoId === undefined
      ? 'SELECT repository_id FROM repository_address WHERE source = ? AND owner = ? AND repo = ?'
      : 'SELECT id FROM repository WHERE source = ? AND external_id = ?'
  const identityArgs =
    coordinates.repoId === undefined
      ? [
          source,
          coordinates.owner.toLowerCase(),
          coordinates.repo.toLowerCase(),
        ]
      : [source, coordinates.repoId]
  type Row = Omit<typeof activityTable.$inferSelect, 'occurredAt'> & {
    occurredAt: number
  }
  const rows = await all<Row>(
    database,
    `SELECT id, repository_id AS repositoryId, source, owner, repo, branch, kind, area, resource, path, previous_path AS previousPath, actor, actor_image AS actorImage, actor_id AS actorId, title, commit_sha AS commitSha, origin, occurred_at AS occurredAt FROM activity WHERE source = ? AND repository_id = (${identity}) AND branch IN (?, '') ORDER BY occurred_at DESC, id DESC LIMIT ?`,
    [source, ...identityArgs, coordinates.branch, activityRetention * 2],
  )
  return rows.map((row) => ({ ...row, occurredAt: new Date(row.occurredAt) }))
}
