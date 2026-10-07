import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'
import { resolveRepositoryPrincipal } from '#/server/repository-policy.server'

import type { ProjectUser } from '#/server/projects.server'
import type { RequestServices } from '#/server/request-services.server'

type ActionContextType =
  'repository' | 'collection' | 'entry' | 'file' | 'media'

function isActionContextType(value: unknown): value is ActionContextType {
  return (
    value === 'repository' ||
    value === 'collection' ||
    value === 'entry' ||
    value === 'file' ||
    value === 'media'
  )
}

function coordinates(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid action request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid action request')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
  }
}

function dispatchRequest(input: unknown) {
  const repository = coordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.actionName !== 'string' ||
    !value.actionName ||
    typeof value.inputs !== 'object' ||
    value.inputs === null ||
    Array.isArray(value.inputs)
  ) {
    throw new Error('Invalid action dispatch')
  }
  const contextValue = value.context
  let actionContext: {
    type: ActionContextType
    name: string | null
    path: string | null
    data: Record<string, unknown>
  } = {
    type: 'repository',
    name: null,
    path: null,
    data: {},
  }
  if (contextValue !== undefined) {
    if (
      typeof contextValue !== 'object' ||
      contextValue === null ||
      Array.isArray(contextValue)
    ) {
      throw new Error('Invalid action context')
    }
    const context = contextValue as Record<string, unknown>
    if (
      !isActionContextType(context.type) ||
      (context.name !== null && typeof context.name !== 'string') ||
      (context.path !== null && typeof context.path !== 'string') ||
      typeof context.data !== 'object' ||
      context.data === null ||
      Array.isArray(context.data)
    ) {
      throw new Error('Invalid action context')
    }
    actionContext = {
      type: context.type,
      name: context.name,
      path: context.path,
      data: context.data as Record<string, unknown>,
    }
  }
  return {
    ...repository,
    actionName: value.actionName,
    inputs: value.inputs as Record<string, unknown>,
    context: actionContext,
  }
}

function managementRequest(input: unknown): ReturnType<typeof coordinates> & {
  runId: number
  intent: 'cancel' | 'rerun'
} {
  const repository = coordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.runId !== 'number' ||
    !Number.isInteger(value.runId) ||
    value.runId <= 0 ||
    (value.intent !== 'cancel' && value.intent !== 'rerun')
  ) {
    throw new Error('Invalid action management request')
  }
  return {
    ...repository,
    runId: value.runId,
    intent: value.intent,
  }
}

async function policy(
  data: ReturnType<typeof coordinates>,
  operation:
    | 'repository.read'
    | 'action.read'
    | 'action.run'
    | 'action.cancel'
    | 'action.rerun',
  services: RequestServices,
  user: ProjectUser,
) {
  return {
    operation,
    principal: await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      data,
    ),
    tenant: {
      type: 'repository' as const,
      id: `${data.owner}/${data.repo}`.toLowerCase(),
    },
    target: { repository: data, branch: data.branch },
    ...('actionName' in data && typeof data.actionName === 'string'
      ? { facts: { action: data.actionName } }
      : {}),
  }
}

function actionUser(user: {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  githubUsername?: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
    githubUsername: user.githubUsername ?? null,
  }
}

export const getActions = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const ref = coordinates(input)
    const value = input as Record<string, unknown>
    if (
      value.includeRuns !== undefined &&
      typeof value.includeRuns !== 'boolean'
    ) {
      throw new Error('Invalid action request')
    }
    return { ...ref, includeRuns: value.includeRuns !== false }
  })
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const accessRequest = await policy(
      data,
      'repository.read',
      services,
      actionUser(session.user),
    )
    return services.access.execute(accessRequest, async () => {
      const { loadRepositoryActions } =
        await import('#/server/action-service.server')
      const result = await loadRepositoryActions({
        allowCollaboratorExecution: Boolean(services.repositoryPermissionAdmin),
        database: services.database,
        cacheDatabase: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user: actionUser(session.user),
        ...data,
      })
      const discovery = await services.access.discover({
        principal: accessRequest.principal,
        tenant: accessRequest.tenant,
        target: accessRequest.target,
        resources: result.actions.map((action) => ({
          type: 'action',
          name: action.name,
        })),
      })
      const resources = [
        ...new Set([
          ...result.actions.map((action) => action.name),
          ...result.runs.map((run) => run.actionName),
        ]),
      ].map((name) => ({ type: 'action' as const, name }))
      const capabilities = await Promise.all(
        (['action.read', 'action.cancel', 'action.rerun'] as const).map(
          (operation) =>
            services.access.discover({
              principal: accessRequest.principal,
              tenant: accessRequest.tenant,
              target: accessRequest.target,
              operation,
              resources,
            }),
        ),
      )
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
          canCancel:
            run.canCancel && visibleTo(capabilities[1], run.actionName),
          canRerun: run.canRerun && visibleTo(capabilities[2], run.actionName),
        }))
      if (discovery.visibility === 'all')
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
  })

export const runAction = createServerFn({ method: 'POST' })
  .validator(dispatchRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      await policy(data, 'action.run', services, actionUser(session.user)),
      async () => {
        const { dispatchRepositoryAction } =
          await import('#/server/action-service.server')
        return dispatchRepositoryAction({
          allowCollaboratorExecution: Boolean(
            services.repositoryPermissionAdmin,
          ),
          database: services.database,
          cacheDatabase: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user: actionUser(session.user),
          ...data,
        })
      },
    )
  })

export const manageAction = createServerFn({ method: 'POST' })
  .validator(managementRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const { readActionRunName } = await import('#/server/action-service.server')
    await resolveRepositoryPrincipal(
      services.repositoryAccess,
      actionUser(session.user),
      data,
    )
    const actionName = await readActionRunName(services.database, data)
    return services.access.execute(
      await policy(
        { ...data, actionName } as typeof data,
        data.intent === 'cancel' ? 'action.cancel' : 'action.rerun',
        services,
        actionUser(session.user),
      ),
      async () => {
        const { manageRepositoryAction } =
          await import('#/server/action-service.server')
        return manageRepositoryAction({
          allowCollaboratorExecution: Boolean(
            services.repositoryPermissionAdmin,
          ),
          database: services.database,
          cacheDatabase: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user: actionUser(session.user),
          ...data,
        })
      },
    )
  })
