import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'

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
  return {
    ...repository,
    actionName: value.actionName,
    inputs: value.inputs as Record<string, unknown>,
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

function policy(
  data: ReturnType<typeof coordinates>,
  operation: 'action.read' | 'action.run',
  userId: string,
) {
  return {
    operation,
    principal: { type: 'user' as const, id: userId },
    tenant: {
      type: 'repository' as const,
      id: `${data.owner}/${data.repo}`.toLowerCase(),
    },
    target: { repository: data, branch: data.branch },
  }
}

function actionUser(user: {
  id: string
  name: string
  email: string
  image?: string | null
  githubUsername?: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    githubUsername: user.githubUsername ?? null,
  }
}

export const getActions = createServerFn({ method: 'GET' })
  .validator(coordinates)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      policy(data, 'action.read', session.user.id),
      async () => {
        const { loadRepositoryActions } =
          await import('#/server/action-service.server')
        return loadRepositoryActions({
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user: actionUser(session.user),
          ...data,
        })
      },
    )
  })

export const runAction = createServerFn({ method: 'POST' })
  .validator(dispatchRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      policy(data, 'action.run', session.user.id),
      async () => {
        const { dispatchRepositoryAction } =
          await import('#/server/action-service.server')
        return dispatchRepositoryAction({
          database: services.database,
          background: services.background,
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
    return services.access.execute(
      policy(data, 'action.run', session.user.id),
      async () => {
        const { manageRepositoryAction } =
          await import('#/server/action-service.server')
        return manageRepositoryAction({
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user: actionUser(session.user),
          ...data,
        })
      },
    )
  })
