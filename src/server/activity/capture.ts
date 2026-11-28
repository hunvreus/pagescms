import { first } from '#/server/db/sql'
import { getEntryTitle } from '#/features/editor/entry-title'
import { activityTarget } from '#/lib/activity'
import { findContentSchema } from '#/shared/configuration-content'
import type { ActivityKind } from '#/lib/activity'
import type { AccessPolicyGateway, AccessRequest } from '#/server/access/policy'
import type { Database } from '#/server/db/client'
import type { userTable } from '#/server/db/schema'
import type { ActivityEvent } from '#/server/activity/store'
import { recordActivity } from '#/server/activity/store'
import { createConfigurationStore } from '#/server/cache/configuration'
import type { ConfigurationStore } from '#/server/cache/configuration'
import {
  ensureRepositoryIdentity,
  findRepositoryIdentityByExternalId,
} from '#/server/access/repository-identity'
import { logServerEvent, serverErrorDetails } from '#/server/http'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
const string = (value: unknown) => (typeof value === 'string' ? value : null)

// Membership services capture per-member outcomes, including bulk and webhook removals.
const kinds: Partial<Record<AccessRequest['operation'], ActivityKind>> = {
  'entry.create': 'added',
  'entry.update': 'edited',
  'entry.delete': 'deleted',
  'entry.rename': 'renamed',
  'media.write': 'uploaded',
  'media.delete': 'deleted',
  'media.rename': 'renamed',
  'configuration.update': 'edited',
}

export async function captureActivity(
  database: Database,
  cacheDatabase: Database,
  request: AccessRequest,
  result: unknown,
  scope: { repositoryId: number; cacheRepositoryId: number | null },
  idempotencyKey?: string,
  configurationStore = createConfigurationStore({ database: cacheDatabase }),
) {
  const kind = kinds[request.operation]
  const repository = request.target?.repository
  const branch = request.target?.branch
  const value = record(result)
  if (!kind || !repository || !branch || !value) return
  const user =
    request.principal.type === 'anonymous'
      ? null
      : await first<
          Pick<typeof userTable.$inferSelect, 'id' | 'name' | 'image'>
        >(database, 'SELECT id, name, image FROM user WHERE id = ?', [
          request.principal.id,
        ])
  const commitSha = string(value.commitSha) ?? string(value.revision)
  const timestamp = string(value.commitTimestamp)
  const event: ActivityEvent = {
    repositoryId: scope.repositoryId,
    owner: repository.owner,
    repo: repository.repo,
    branch,
    kind,
    area: 'configuration',
    resource: '',
    path: '',
    origin: 'cms',
    actor: user?.name ?? null,
    actorImage: user?.image ?? null,
    actorId: user?.id ?? null,
    commitSha,
    occurredAt:
      timestamp && Number.isFinite(Date.parse(timestamp))
        ? new Date(timestamp)
        : new Date(),
  }
  if (!commitSha && idempotencyKey)
    event.key = `${request.operation}:${idempotencyKey}`
  if (!commitSha && typeof request.facts?.activityKey === 'string')
    event.key = `${request.operation}:${request.facts.activityKey}`
  const path =
    string(value.newPath) ?? string(value.path) ?? request.target.path
  if (!path) return
  // Upload initiation and abort return no committed path/revision. Only completed
  // operations reach this point with a mutation result.
  if (request.operation === 'media.write' && !('revision' in value)) return
  const configuration =
    scope.cacheRepositoryId === null
      ? null
      : await configurationStore.find(
          repository.owner,
          repository.repo,
          branch,
          undefined,
          scope.cacheRepositoryId,
        )
  const preferred = request.target.media
    ? { area: 'media', resource: request.target.media }
    : request.target.collection && configuration
      ? {
          area:
            findContentSchema(configuration.object, request.target.collection)
              ?.type ?? '',
          resource: request.target.collection,
        }
      : undefined
  const target = activityTarget(configuration?.object ?? null, path, preferred)
  if (!target) return
  Object.assign(event, target, { path })
  if (kind === 'renamed') event.previousPath = request.target.path ?? null
  if (
    kind === 'renamed' &&
    (!event.previousPath || event.previousPath === path)
  )
    return
  if (target.area === 'configuration')
    event.kind = request.facts?.newFile === true ? 'added' : kind
  const entry = record(value.entry)
  if (entry && typeof entry.filename === 'string') {
    event.title = getEntryTitle({
      content: entry.content,
      schema: configuration
        ? findContentSchema(configuration.object, target.resource)
        : undefined,
      locale: string(entry.locale) ?? undefined,
      filename: entry.filename,
      primaryField: string(entry.primaryField) ?? undefined,
      schemaType: string(entry.schemaType) ?? undefined,
      label: string(entry.label) ?? undefined,
    })
  }
  await recordActivity(database, [event])
}

// Capture after the operation itself commits, even if quota settlement later needs
// recovery. Logging failure must not turn a successful remote save into a retry.
export function withActivityCapture(
  access: AccessPolicyGateway,
  database: Database,
  cacheDatabase: Database,
  waitUntil?: (promise: Promise<unknown>) => void,
  configurationStore?: ConfigurationStore,
): AccessPolicyGateway {
  async function observed<T>(
    request: AccessRequest,
    operation: () => Promise<T>,
    idempotencyKey?: string,
  ): Promise<T> {
    // Resolve local IDs before the remote operation can rename/reassign an address.
    // Cache and core databases may assign different IDs to the same repository.
    let scope:
      { repositoryId: number; cacheRepositoryId: number | null } | undefined
    const repository = request.target?.repository
    if (kinds[request.operation] && repository && request.target.branch) {
      try {
        const admitted =
          request.principal.type === 'anonymous'
            ? undefined
            : request.principal.repositoryIdentity
        const repoId = admitted?.externalId ?? repository.repoId
        const identity = repoId
          ? await findRepositoryIdentityByExternalId(
              database,
              repoId,
              admitted?.source,
            )
          : await ensureRepositoryIdentity(database, repository)
        if (!identity) throw new Error('Activity repository identity not found')
        const cacheIdentity =
          cacheDatabase === database
            ? identity
            : identity.externalId
              ? await findRepositoryIdentityByExternalId(
                  cacheDatabase,
                  identity.externalId,
                  identity.source,
                )
              : null
        scope = {
          repositoryId: identity.id,
          cacheRepositoryId: cacheIdentity?.id ?? null,
        }
      } catch (error) {
        logServerEvent('error', {
          event: 'activity_capture_failed',
          operation: request.operation,
          ...serverErrorDetails(error),
        })
      }
    }
    const result = await operation()
    if (!scope) return result
    const capture = captureActivity(
      database,
      cacheDatabase,
      request,
      result,
      scope,
      idempotencyKey,
      configurationStore,
    ).catch((error: unknown) => {
      logServerEvent('error', {
        event: 'activity_capture_failed',
        operation: request.operation,
        ...serverErrorDetails(error),
      })
    })
    if (waitUntil) waitUntil(capture)
    else await capture
    return result
  }
  return {
    ...access,
    authorizeMany: (requests) => access.authorizeMany(requests),
    execute: (request, operation) =>
      access.execute(request, (grant) =>
        observed(request, () => operation(grant)),
      ),
    executeQuota: (request, key, operation) =>
      access.executeQuota(request, key, () =>
        observed(request, operation, key),
      ),
  }
}
