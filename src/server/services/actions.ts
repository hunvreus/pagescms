import {
  loadRepositoryActions,
  readActionRunStatuses,
  dispatchRepositoryAction,
  readActionRunName,
  manageRepositoryAction,
} from '#/server/actions/actions'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { repositoryTenant } from '#/server/services/context'

import type { AccessRequest } from '#/server/access/policy'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { ServiceContext, ServiceUser } from '#/server/services/context'
import type { managementRequest } from '#/shared/requests/action'

export type ActionCoordinates = {
  owner: string
  repo: string
  repoId?: string
  branch: string
}

export type ActionContextType =
  'repository' | 'collection' | 'entry' | 'file' | 'media'

export async function actionAccessRequest(
  data: ActionCoordinates & { actionName?: string },
  operation:
    | 'repository.read'
    | 'action.read'
    | 'action.run'
    | 'action.cancel'
    | 'action.rerun',
  services: Pick<ServiceContext, 'repositoryAccess'>,
  user: RepositoryUser,
): Promise<AccessRequest> {
  return {
    operation,
    principal: await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      data,
    ),
    tenant: repositoryTenant(data),
    target: { repository: data, branch: data.branch },
    ...(typeof data.actionName === 'string'
      ? { facts: { action: data.actionName } }
      : {}),
  }
}

/** Lists configured actions and runs visible to the current principal. */
export async function readActions(
  services: ServiceContext,
  user: ServiceUser,
  data: ActionCoordinates & { includeRuns?: boolean; runIds?: number[] },
) {
  const accessRequest = await actionAccessRequest(
    data,
    'repository.read',
    services,
    user,
  )
  const admittedRepoId =
    accessRequest.principal.type === 'anonymous'
      ? undefined
      : accessRequest.principal.repositoryIdentity?.externalId
  return services.access.execute(accessRequest, async (grant) => {
    const result = await (
      data.runIds ? readActionRunStatuses : loadRepositoryActions
    )({
      allowCollaboratorExecution:
        grant?.delegatedOperations?.includes('action.rerun') === true,
      database: services.database,
      cacheDatabase: services.cacheDatabase,
      repositoryAccess: services.repositoryAccess,
      user,
      ...data,
      repoId: admittedRepoId ?? data.repoId,
      runIds: data.runIds ?? [],
    })
    const resources = [
      ...new Set([
        ...result.actions.map((action) => action.name),
        ...result.runs.map((run) => run.actionName),
      ]),
    ].map((name) => ({ type: 'action' as const, name }))
    // Resource discovery and explicit run capabilities are separate policy gates.
    // Resolve independent decisions together without assuming custom policies equate them.
    const [discovery, ...capabilities] = await Promise.all([
      services.access.discover({
        principal: accessRequest.principal,
        tenant: accessRequest.tenant,
        target: accessRequest.target,
        resources: result.actions.map((action) => ({
          type: 'action',
          name: action.name,
        })),
      }),
      ...(['action.read', 'action.cancel', 'action.rerun'] as const).map(
        (operation) =>
          services.access.discover({
            principal: accessRequest.principal,
            tenant: accessRequest.tenant,
            target: accessRequest.target,
            operation,
            resources,
          }),
      ),
    ])
    const visibleTo = (decision: typeof discovery, name: string) =>
      decision.visibility === 'all' ||
      (decision.visibility === 'filtered' &&
        decision.resources.some(
          (resource) => resource.type === 'action' && resource.name === name,
        ))
    const readableRuns = result.runs
      .filter((run) => visibleTo(capabilities[0], run.actionName))
      .map((run) => ({
        ...run,
        canCancel: run.canCancel && visibleTo(capabilities[1], run.actionName),
        canRerun: run.canRerun && visibleTo(capabilities[2], run.actionName),
      }))
    if (data.runIds || discovery.visibility === 'all')
      return { ...result, runs: readableRuns }
    const visible = new Set(
      discovery.visibility === 'filtered'
        ? discovery.resources.map((resource) => resource.name)
        : [],
    )
    return {
      actions: result.actions.filter((action) => visible.has(action.name)),
      runs: readableRuns.filter((run) => visible.has(run.actionName)),
    }
  })
}

export async function runRepositoryAction(
  services: ServiceContext,
  user: ServiceUser,
  data: ActionCoordinates & {
    actionName: string
    inputs: Record<string, unknown>
    context: {
      type: ActionContextType
      name: string | null
      path: string | null
      data: Record<string, unknown>
    }
  },
) {
  const accessRequest = await actionAccessRequest(
    data,
    'action.run',
    services,
    user,
  )
  const admittedRepoId =
    accessRequest.principal.type === 'anonymous'
      ? undefined
      : accessRequest.principal.repositoryIdentity?.externalId
  return services.access.execute(accessRequest, async (grant) => {
    return dispatchRepositoryAction({
      allowCollaboratorExecution:
        grant?.delegatedOperations?.includes('action.run') === true,
      database: services.database,
      cacheDatabase: services.cacheDatabase,
      repositoryAccess: services.repositoryAccess,
      user,
      ...data,
      repoId: admittedRepoId ?? data.repoId,
    })
  })
}

export async function manageActionRun(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof managementRequest>,
) {
  const principal = await resolveRepositoryPrincipal(
    services.repositoryAccess,
    user,
    data,
  )
  const scopedData = {
    ...data,
    repoId:
      principal.type === 'anonymous'
        ? data.repoId
        : (principal.repositoryIdentity?.externalId ?? data.repoId),
  }
  const actionName = await readActionRunName(services.database, scopedData)
  return services.access.execute(
    await actionAccessRequest(
      { ...scopedData, actionName },
      data.intent === 'cancel' ? 'action.cancel' : 'action.rerun',
      services,
      user,
    ),
    async (grant) => {
      return manageRepositoryAction({
        allowCollaboratorExecution:
          grant?.delegatedOperations?.includes(
            data.intent === 'cancel' ? 'action.cancel' : 'action.rerun',
          ) === true,
        database: services.database,
        cacheDatabase: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...scopedData,
      })
    },
  )
}
