import {
  repositoryAdmissionPrincipal,
  requireRepositoryManager,
} from '#/server/access/repository-policy'
import type { RequestServices } from '#/server/context'
import type { parseActivityRequest } from '#/shared/requests/activity'
import type { serviceUserFromSession } from '#/server/services/context'

import { findRepositoryIdentityByExternalId } from '#/server/access/repository-identity'
import { all } from '#/server/db/sql'
import { DEFAULT_REPOSITORY_SOURCE } from '#/server/repository/provider'
import { activityActors, activityTitles } from '#/server/activity/details'
import type { ActivityWithActor } from '#/server/activity/details'
import { repositoryActions, schemaActions } from '#/lib/actions'
import {
  activityPageSize,
  activityRetention,
  activityTarget,
} from '#/lib/activity'
import type { ActivityKind } from '#/lib/activity'
import type { AccessPolicyGateway, AccessRequest } from '#/server/access/policy'
import { AccessDeniedError } from '#/server/access/policy'
import type { Database } from '#/server/db/client'
import { readActivity as readStoredActivity } from '#/server/activity/store'
import { createConfigurationStore } from '#/server/cache/configuration'
import type { ConfigurationStore } from '#/server/cache/configuration'
import { getConfigurationActionNames } from '#/shared/configuration-discovery'
import {
  findContentSchema,
  findMediaSchema,
} from '#/shared/configuration-content'

export async function loadActivity(input: {
  database: Database
  cacheDatabase: Database
  cacheRepositoryId?: number
  configurationStore?: ConfigurationStore
  access: AccessPolicyGateway
  request: AccessRequest
  owner: string
  repo: string
  branch: string
  page: number
  canManage?: () => Promise<boolean>
}) {
  const { database, cacheDatabase, request, access } = input
  await access.authorize(request)
  const admitted =
    request.principal.type === 'anonymous'
      ? undefined
      : request.principal.repositoryIdentity
  const repoId = admitted?.externalId ?? request.target?.repository?.repoId
  const [{ configuration, cacheId }, rows] = await Promise.all([
    (async () => {
      const cacheIdentity = input.cacheRepositoryId
        ? { id: input.cacheRepositoryId }
        : repoId
          ? await findRepositoryIdentityByExternalId(
              cacheDatabase,
              repoId,
              admitted?.source,
            )
          : undefined
      if (repoId && !cacheIdentity)
        return { configuration: null, cacheId: undefined }
      const cachedConfiguration = await (
        input.configurationStore ??
        createConfigurationStore({
          database: cacheDatabase,
        })
      ).find(
        input.owner,
        input.repo,
        input.branch,
        admitted?.source,
        cacheIdentity?.id,
      )
      return { configuration: cachedConfiguration, cacheId: cacheIdentity?.id }
    })(),
    readStoredActivity(database, {
      ...input,
      source: admitted?.source,
      repoId,
    }),
  ])
  const actions = configuration
    ? getConfigurationActionNames(configuration.object)
    : []
  // Reuse durable action-run records, without polling GitHub or copying payloads into activity.
  const source = admitted?.source ?? DEFAULT_REPOSITORY_SOURCE
  const identity =
    repoId === undefined
      ? 'SELECT repository_id FROM repository_address WHERE source = ? AND owner = ? AND repo = ?'
      : 'SELECT id FROM repository WHERE source = ? AND external_id = ?'
  const identityArgs =
    repoId === undefined
      ? [source, input.owner.toLowerCase(), input.repo.toLowerCase()]
      : [source, repoId]
  const runs = actions.length
    ? (
        await all<{
          id: number
          name: string
          path: string | null
          collection: string | null
          context: string
          actor: string
          at: number
        }>(
          database,
          `SELECT id, action_name AS name, context_path AS path, context_name AS collection, context_type AS context, triggered_by AS actor, created_at AS at FROM action_run WHERE repository_id = (${identity}) AND ref = ? AND action_name IN (${actions.map(() => '?').join(', ')}) ORDER BY created_at DESC, id DESC LIMIT ?`,
          [...identityArgs, input.branch, ...actions, activityRetention],
        )
      ).map((run) => ({
        ...run,
        actor: JSON.parse(run.actor) as unknown,
        at: new Date(run.at),
      }))
    : []
  const authorizations = new Map<string, Promise<boolean>>()
  function allowed(
    operation: AccessRequest['operation'],
    target: AccessRequest['target'],
    facts?: AccessRequest['facts'],
  ) {
    const key = JSON.stringify([operation, target, facts])
    let pending = authorizations.get(key)
    if (!pending) {
      pending = access
        .authorize({ ...request, operation, target, facts })
        .then(() => true)
        .catch((error: unknown) => {
          if (error instanceof AccessDeniedError) return false
          throw error
        })
      authorizations.set(key, pending)
    }
    return pending
  }
  const visible: ActivityWithActor[] = []
  let manager: Promise<boolean> | undefined
  for (const row of rows) {
    let operation: AccessRequest['operation']
    const target = { ...request.target }
    if (row.area === 'collaborator' || row.area === 'permissions') {
      manager ??= input.canManage?.() ?? Promise.resolve(false)
      if (!(await manager)) continue
      operation =
        row.area === 'collaborator' ? 'collaborator.read' : 'repository.manage'
    } else if (row.area === 'configuration') operation = 'configuration.read'
    else {
      const current = activityTarget(
        configuration?.object ?? null,
        row.path,
        row,
      )
      if (
        !current ||
        current.area !== row.area ||
        current.resource !== row.resource
      )
        continue
      operation = row.area === 'media' ? 'media.read' : 'entry.read'
      if (row.area === 'media')
        Object.assign(target, { media: row.resource, path: row.path })
      else Object.assign(target, { collection: row.resource, path: row.path })
      if (row.previousPath) {
        const previous = activityTarget(
          configuration?.object ?? null,
          row.previousPath,
          row,
        )
        if (
          !previous ||
          previous.resource !== row.resource ||
          !(await allowed(operation, { ...target, path: row.previousPath }))
        )
          continue
      }
    }
    if (!(await allowed(operation, target))) continue
    visible.push({
      id: row.id,
      area: row.area,
      resource: row.resource,
      kind: row.kind as ActivityKind,
      path: row.path,
      previousPath: row.previousPath,
      actor: row.actor,
      actorImage: row.actorImage,
      actorId: row.actorId,
      title: row.title,
      occurredAt: row.occurredAt.toISOString(),
    })
  }
  for (const run of runs) {
    if (!actions.includes(run.name)) continue
    if (
      run.collection &&
      configuration &&
      !(run.context === 'media'
        ? findMediaSchema(configuration.object, run.collection)
        : findContentSchema(configuration.object, run.collection))
    )
      continue
    const target = { ...request.target, path: run.path ?? undefined }
    if (!(await allowed('action.read', target, { action: run.name }))) continue
    if (
      run.collection &&
      !(await allowed(
        run.context === 'media'
          ? 'media.read'
          : run.context === 'collection'
            ? 'collection.read'
            : 'entry.read',
        {
          ...target,
          ...(run.context === 'media'
            ? { media: run.collection }
            : { collection: run.collection }),
        },
      ))
    )
      continue
    const actor =
      run.actor &&
      typeof run.actor === 'object' &&
      'name' in run.actor &&
      typeof run.actor.name === 'string'
        ? run.actor.name
        : null
    const schema =
      run.collection && configuration
        ? run.context === 'media'
          ? findMediaSchema(configuration.object, run.collection)
          : findContentSchema(configuration.object, run.collection)
        : null
    const definitions = schema
      ? schemaActions(
          schema,
          run.context === 'entry'
            ? 'entry'
            : run.context === 'collection'
              ? 'collection'
              : undefined,
        )
      : configuration
        ? repositoryActions(configuration.object)
        : []
    const definition = definitions.find((action) => action.name === run.name)
    visible.push({
      id: `action:${run.id}`,
      area: 'action',
      resource: run.name,
      kind: 'run',
      path: run.name,
      title: definition?.label || run.name,
      actorId:
        run.actor &&
        typeof run.actor === 'object' &&
        'userId' in run.actor &&
        typeof run.actor.userId === 'string'
          ? run.actor.userId
          : null,
      previousPath: null,
      actor,
      actorImage:
        run.actor &&
        typeof run.actor === 'object' &&
        'image' in run.actor &&
        typeof run.actor.image === 'string'
          ? run.actor.image
          : null,
      occurredAt: run.at.toISOString(),
    })
  }
  visible.sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
  )
  const retained = visible.slice(0, activityRetention)
  const offset = input.page * activityPageSize
  const actors = await activityActors(
    database,
    retained.slice(offset, offset + activityPageSize),
  )
  const items = await activityTitles(
    cacheDatabase,
    configuration?.object ?? null,
    { ...input, repositoryId: cacheId },
    actors,
  )
  return {
    items,
    page: input.page,
    hasNext: offset + activityPageSize < retained.length,
  }
}

export async function readActivity(
  services: RequestServices,
  user: ReturnType<typeof serviceUserFromSession>,
  data: ReturnType<typeof parseActivityRequest>,
) {
  const admission = await services.repositoryAccess.resolve(
    user,
    data.owner,
    data.repo,
    data.branch,
    data.repoId,
  )
  const principal = repositoryAdmissionPrincipal(user, admission)
  return loadActivity({
    ...data,
    database: services.database,
    cacheDatabase: services.cacheDatabase,
    configurationStore: services.repositoryAccess.configurationStore,
    cacheRepositoryId: admission.identity?.cacheId,
    access: services.access,
    canManage: async () => {
      if (principal.type !== 'user') return false
      try {
        await requireRepositoryManager(services.repositoryAccess, user, data)
        return true
      } catch {
        return false
      }
    },
    request: {
      operation: 'repository.read',
      principal,
      tenant: {
        type: 'repository',
        id: `${data.owner}/${data.repo}`.toLowerCase(),
      },
      target: { repository: data, branch: data.branch },
    },
  })
}
