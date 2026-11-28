import type { repositoryTable } from '#/server/db/schema'
import { all, first } from '#/server/db/sql'
import { executeAtomic } from '#/server/db/core'
import { DEFAULT_REPOSITORY_SOURCE } from '#/server/repository/provider'
import { invalidateRepositoryReads } from '#/server/cache/repository-read'
import type { Database, DatabaseStatement } from '#/server/db/client'

type Address = { owner: string; repo: string; source?: string }
type Metadata = Address & { id: string | number; ownerId?: string | number }

export class RepositoryIdentityConflictError extends Error {}

type RepositoryRow = Omit<
  typeof repositoryTable.$inferSelect,
  'lastOpenedAt'
> & { lastOpenedAt: number }
const repositoryColumns = `r.id, r.source, r.external_id AS externalId, r.owner_id AS ownerId,
  r.owner, r.repo, r.last_opened_at AS lastOpenedAt`

async function readRepository(
  database: Database,
  query: string,
  args: (string | number)[],
) {
  const row = await first<RepositoryRow>(database, query, args)
  return row ? { ...row, lastOpenedAt: new Date(row.lastOpenedAt) } : undefined
}

/** Finds the local record for a forge repository ID (stable across renames). */
export function findRepositoryIdentityByExternalId(
  database: Database,
  externalId: string,
  source = DEFAULT_REPOSITORY_SOURCE,
) {
  return readRepository(
    database,
    `SELECT ${repositoryColumns} FROM repository r WHERE r.source = ? AND r.external_id = ? LIMIT 1`,
    [source, externalId],
  )
}

/** Returns current CMS addresses for discovery. Callers still authorize each match. */
export async function searchRepositoryIdentities(
  database: Database,
  query: string,
  scope: { owners: string[] } | { repositoryIds: string[] },
  source = DEFAULT_REPOSITORY_SOURCE,
) {
  const term = query.trim().toLowerCase()
  const slash = term.indexOf('/')
  const owner = slash < 0 ? undefined : term.slice(0, slash)
  const name = term.slice(slash + 1)
  const byOwner = 'owners' in scope
  const values = byOwner
    ? scope.owners.map((login) => login.toLowerCase())
    : scope.repositoryIds
  if (!values.length || !name || owner === '') return []
  const filter =
    owner === undefined
      ? 'instr(lower(r.repo), ?) > 0'
      : 'lower(r.owner) = ? AND lower(r.repo) = ?'
  return all<{
    externalId: string
    ownerId: string
    source: string
    owner: string
    repo: string
  }>(
    database,
    `SELECT r.external_id AS externalId, r.owner_id AS ownerId, r.source, r.owner, r.repo
     FROM repository r WHERE r.source = ? AND r.external_id IS NOT NULL AND r.owner_id IS NOT NULL
     AND ${byOwner ? 'lower(r.owner)' : 'r.external_id'} IN (SELECT value FROM json_each(?))
     AND ${filter}
     ORDER BY (lower(r.repo) = ?) DESC, lower(r.repo), lower(r.owner), r.external_id LIMIT 20`,
    [
      source,
      JSON.stringify(values),
      ...(owner === undefined ? [] : [owner]),
      name,
      name,
    ],
  )
}

export async function findRepositoryIdentity(
  database: Database,
  address: Address,
) {
  return (
    (await readRepository(
      database,
      `
    SELECT ${repositoryColumns} FROM repository_address a
    JOIN repository r ON r.id = a.repository_id
    WHERE a.source = ? AND a.owner = ? AND a.repo = ? LIMIT 1
  `,
      [
        address.source ?? DEFAULT_REPOSITORY_SOURCE,
        address.owner.toLowerCase(),
        address.repo.toLowerCase(),
      ],
    )) ?? null
  )
}

// A cold write may not have opened the workspace. Allocate a local scope without
// a GitHub preflight; authoritative metadata binds it to the forge ID later.
export async function ensureRepositoryIdentity(
  database: Database,
  address: Address,
) {
  const existing = await findRepositoryIdentity(database, address)
  if (existing) return existing
  const source = address.source ?? DEFAULT_REPOSITORY_SOURCE
  const statements = [
    {
      sql: `insert into repository (source, owner, repo, last_opened_at)
      select ?, ?, ?, 0 where not exists (select 1 from repository_address where source = ? and owner = ? and repo = ?)`,
      args: [
        source,
        address.owner,
        address.repo,
        source,
        address.owner.toLowerCase(),
        address.repo.toLowerCase(),
      ],
    },
    {
      sql: `insert into repository_address (source, owner, repo, repository_id)
      select ?, ?, ?, id from repository where source = ? and lower(owner) = ? and lower(repo) = ? order by id desc limit 1 on conflict do nothing`,
      args: [
        source,
        address.owner.toLowerCase(),
        address.repo.toLowerCase(),
        source,
        address.owner.toLowerCase(),
        address.repo.toLowerCase(),
      ],
    },
  ]
  await executeAtomic(database, statements)
  const created = await findRepositoryIdentity(database, address)
  if (!created) throw new Error('Could not create repository identity')
  return created
}

export async function observeRepositoryIdentity(
  database: Database,
  metadata: Metadata,
  requested?: Address,
  options?: { readOnlyIfMatches?: boolean },
) {
  const source = metadata.source ?? DEFAULT_REPOSITORY_SOURCE
  if (
    (typeof metadata.id !== 'string' && typeof metadata.id !== 'number') ||
    !String(metadata.id) ||
    !metadata.owner ||
    !metadata.repo
  )
    throw new Error('Invalid repository identity')
  const externalId = String(metadata.id)
  const differentAddress =
    requested &&
    (requested.owner.toLowerCase() !== metadata.owner.toLowerCase() ||
      requested.repo.toLowerCase() !== metadata.repo.toLowerCase())
  const matches = await all<RepositoryRow & { matched: string }>(
    database,
    `SELECT ${repositoryColumns}, 'known' AS matched FROM repository r
       WHERE r.source = ? AND r.external_id = ?
     UNION ALL
     SELECT ${repositoryColumns}, 'current' AS matched FROM repository_address a
       JOIN repository r ON r.id = a.repository_id
       WHERE a.source = ? AND a.owner = ? AND a.repo = ?${
         differentAddress
           ? `
     UNION ALL
     SELECT ${repositoryColumns}, 'previous' AS matched FROM repository_address a
       JOIN repository r ON r.id = a.repository_id
       WHERE a.source = ? AND a.owner = ? AND a.repo = ?`
           : ''
       }`,
    [
      source,
      externalId,
      source,
      metadata.owner.toLowerCase(),
      metadata.repo.toLowerCase(),
      ...(differentAddress
        ? [source, requested.owner.toLowerCase(), requested.repo.toLowerCase()]
        : []),
    ],
  )
  const matching = (name: string) => {
    const row = matches.find((value) => value.matched === name)
    if (!row) return undefined
    const { matched: _matched, ...repository } = row
    return { ...repository, lastOpenedAt: new Date(repository.lastOpenedAt) }
  }
  const known = matching('known')
  const current = matching('current')
  const previous = requested
    ? differentAddress
      ? matching('previous')
      : current
    : undefined
  if (
    known &&
    known.owner === metadata.owner &&
    known.repo === metadata.repo &&
    (metadata.ownerId === undefined ||
      known.ownerId === String(metadata.ownerId)) &&
    current?.id === known.id &&
    (!requested || previous?.id === known.id)
  )
    return known
  // A cache hit cannot prove a rename or transfer. Only fresh provider
  // metadata may change identity rows, including on a cold address.
  if (options?.readOnlyIfMatches)
    throw new RepositoryIdentityConflictError('Repository identity changed')
  const provisional = [current, previous].find(
    (row) => row?.externalId === null,
  )
  const candidate = known ?? provisional
  const ownerId =
    metadata.ownerId === undefined
      ? (candidate?.ownerId ?? null)
      : String(metadata.ownerId)
  const statements: DatabaseStatement[] = []
  if (candidate)
    statements.push({
      sql: 'update repository set external_id = ?, owner_id = ?, owner = ?, repo = ? where id = ? and (external_id is null or external_id = ?)',
      args: [
        externalId,
        ownerId,
        metadata.owner,
        metadata.repo,
        candidate.id,
        externalId,
      ],
    })
  statements.push({
    sql: `insert into repository (source, external_id, owner_id, owner, repo, last_opened_at) values (?, ?, ?, ?, ?, 0)
    on conflict(source, external_id) do update set owner_id = excluded.owner_id, owner = excluded.owner, repo = excluded.repo`,
    args: [source, externalId, ownerId, metadata.owner, metadata.repo],
  })
  const id = '(select id from repository where source = ? and external_id = ?)'
  for (const address of [metadata, ...(requested ? [requested] : [])])
    statements.push({
      sql: `insert into repository_address (source, owner, repo, repository_id) values (?, ?, ?, ${id}) on conflict(source, owner, repo) do update set repository_id = excluded.repository_id`,
      args: [
        source,
        address.owner.toLowerCase(),
        address.repo.toLowerCase(),
        source,
        externalId,
      ],
    })
  if (source === DEFAULT_REPOSITORY_SOURCE && metadata.ownerId !== undefined) {
    statements.push({
      sql: 'delete from collaborator where repo_id = ? and owner_id != ?',
      args: [Number(externalId), Number(metadata.ownerId)],
    })
    statements.push({
      sql: 'delete from collaborator_invite where repo_id = ? and not exists (select 1 from collaborator where collaborator.repo_id = collaborator_invite.repo_id and lower(collaborator.email) = lower(collaborator_invite.email) and collaborator.owner_id = ?)',
      args: [Number(externalId), Number(metadata.ownerId)],
    })
    statements.push({
      sql: 'update collaborator set owner = ?, repo = ? where repo_id = ? and owner_id = ?',
      args: [
        metadata.owner,
        metadata.repo,
        Number(externalId),
        Number(metadata.ownerId),
      ],
    })
    statements.push({
      sql: 'update collaborator_invite set owner = ?, repo = ? where repo_id = ?',
      args: [metadata.owner, metadata.repo, Number(externalId)],
    })
  }
  if (known?.ownerId && ownerId && known.ownerId !== ownerId) {
    for (const table of ['cache_file', 'cache_file_meta', 'config'])
      statements.push({
        sql: `delete from ${table} where repository_id = ${id}`,
        args: [source, externalId],
      })
  }
  if (
    candidate &&
    (candidate.owner !== metadata.owner || candidate.repo !== metadata.repo)
  ) {
    for (const table of [
      'config',
      'cache_file',
      'cache_file_meta',
      'activity',
      'action_run',
    ])
      statements.push({
        sql: `update ${table} set owner = ?, repo = ? where repository_id = ${id}`,
        args: [metadata.owner, metadata.repo, source, externalId],
      })
  }
  // Only unverified local scopes may converge. A different verified repository
  // reusing the address keeps its own isolated records and history.
  for (const row of [current, previous].filter(
    (scope, index, rows) =>
      scope?.externalId === null &&
      scope.id !== candidate?.id &&
      rows.findIndex((value) => value?.id === scope.id) === index,
  )) {
    if (!row) continue
    for (const table of ['cache_file', 'cache_file_meta', 'config'])
      statements.push({
        sql: `delete from ${table} where repository_id = ?`,
        args: [row.id],
      })
    for (const table of ['activity', 'action_run', 'repository_address'])
      statements.push({
        sql: `update ${table} set repository_id = ${id} where repository_id = ?`,
        args: [source, externalId, row.id],
      })
    statements.push({
      sql: 'delete from repository where id = ?',
      args: [row.id],
    })
  }
  const invalidateChangedAddresses = () => {
    for (const address of [metadata, requested, known])
      if (address)
        invalidateRepositoryReads(address.owner, address.repo, source)
  }
  // Provider-internal caches use address keys too. Drop old and concurrent
  // reads around a mapping change so a replacement cannot inherit them.
  invalidateChangedAddresses()
  try {
    await executeAtomic(database, statements)
  } finally {
    invalidateChangedAddresses()
  }
  const observed = await findRepositoryIdentityByExternalId(
    database,
    externalId,
    source,
  )
  if (!observed) throw new Error('Could not record repository identity')
  return observed
}

export function repositoryPolicyIdentityFromRow(
  row: Awaited<ReturnType<typeof findRepositoryIdentity>>,
  address: Address,
) {
  if (!row?.externalId || !row.ownerId)
    throw new Error(
      `Verified repository identity is required for ${address.owner}/${address.repo}`,
    )
  // Membership/role grants belong to the owning account; transfers must not
  // inherit the previous owner's grants. Repository renames preserve this key.
  return JSON.stringify([row.source, row.externalId, row.ownerId])
}
