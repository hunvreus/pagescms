import { normalizeGitPath } from '#/shared/git-path'
import { createActivityMatcher } from '#/lib/activity'
import type { Database } from '#/server/db/client'
import type { ActivityEvent } from '#/server/activity/store'
import { recordActivity } from '#/server/activity/store'
import { createConfigurationStore } from '#/server/cache/configuration'
import type { ConfigurationStore } from '#/server/cache/configuration'
import { logServerEvent, serverErrorDetails } from '#/server/http'
import { findRepositoryIdentityByExternalId } from '#/server/access/repository-identity'

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export async function capturePushActivity(
  database: Database,
  cacheDatabase: Database,
  payload: Record<string, unknown>,
  previousConfiguration?: Record<string, unknown> | null,
  configurationStore: ConfigurationStore = createConfigurationStore({
    database: cacheDatabase,
  }),
) {
  if (
    payload.deleted === true ||
    payload.created === true ||
    typeof payload.ref !== 'string' ||
    !payload.ref.startsWith('refs/heads/')
  )
    return
  const repository = record(payload.repository)
  const externalId =
    typeof repository?.id === 'number' ? String(repository.id) : undefined
  const [identity, cacheIdentity] = externalId
    ? await Promise.all([
        findRepositoryIdentityByExternalId(database, externalId),
        findRepositoryIdentityByExternalId(cacheDatabase, externalId),
      ])
    : [undefined, undefined]
  if (externalId && (!identity || !cacheIdentity)) return
  const owner = record(repository?.owner)?.login
  const repo = repository?.name
  const branch = payload.ref.slice('refs/heads/'.length)
  if (
    typeof owner !== 'string' ||
    typeof repo !== 'string' ||
    !branch ||
    !Array.isArray(payload.commits)
  )
    return
  const configurationChanged = payload.commits.some((value) =>
    ['added', 'modified', 'removed'].some((field) => {
      const paths = record(value)?.[field]
      return Array.isArray(paths) && paths.includes('.pages.yml')
    }),
  )
  const configuration =
    previousConfiguration === undefined || configurationChanged
      ? await configurationStore.find(
          owner,
          repo,
          branch,
          undefined,
          cacheIdentity?.id,
        )
      : null
  // Unconfigured repositories must not generate network lookups or content activity.
  const configured = configuration?.object ?? previousConfiguration ?? null
  const match = createActivityMatcher(configured)
  const matchPrevious = createActivityMatcher(previousConfiguration ?? null)
  const events: ActivityEvent[] = []
  // Send the full configured event batch to the capture point. Only persistence is
  // capped, so a future notification consumer can observe changes beyond the feed.
  // Multiple edits to one path in separate commits remain separate events.
  const commits = payload.commits
    .map(record)
    .filter(
      (commit) =>
        commit &&
        typeof commit.id === 'string' &&
        typeof commit.timestamp === 'string' &&
        Number.isFinite(Date.parse(commit.timestamp)),
    )
    .sort(
      (a, b) =>
        Date.parse(String(b!.timestamp)) - Date.parse(String(a!.timestamp)),
    )
  for (const commit of commits) {
    for (const [field, kind] of [
      ['added', 'added'],
      ['modified', 'edited'],
      ['removed', 'deleted'],
    ] as const) {
      const paths = commit![field]
      if (!Array.isArray(paths)) continue
      for (const value of paths) {
        if (typeof value !== 'string') continue
        const path = normalizeGitPath(value)
        const target =
          match(path) ?? (kind === 'deleted' ? matchPrevious(path) : null)
        if (!target) continue
        const author = record(commit!.author)
        const sender = record(payload.sender)
        const image =
          typeof author?.avatar_url === 'string'
            ? author.avatar_url
            : typeof author?.username === 'string' &&
                author.username === sender?.login &&
                typeof sender.avatar_url === 'string'
              ? sender.avatar_url
              : null
        events.push({
          repositoryId: identity?.id,
          owner,
          repo,
          branch,
          ...target,
          kind,
          path,
          commitSha: String(commit!.id),
          occurredAt: new Date(String(commit!.timestamp)),
          actor:
            typeof author?.username === 'string'
              ? author.username
              : typeof author?.name === 'string'
                ? author.name
                : null,
          actorImage: image,
          origin: 'webhook',
        })
      }
    }
  }
  await recordActivity(database, events)
}

export async function safelyCapturePushActivity(
  database: Database,
  cacheDatabase: Database,
  payload: Record<string, unknown>,
  previousConfiguration?: Record<string, unknown> | null,
  configurationStore?: ConfigurationStore,
) {
  try {
    await capturePushActivity(
      database,
      cacheDatabase,
      payload,
      previousConfiguration,
      configurationStore,
    )
  } catch (error) {
    logServerEvent('error', {
      event: 'activity_webhook_capture_failed',
      ...serverErrorDetails(error),
    })
  }
}
