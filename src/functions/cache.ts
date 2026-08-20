import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'

import type { CacheAction } from '#/server/cache-service.server'

const cacheActions = new Set<CacheAction>([
  'reconcile-content',
  'clear-content',
  'clear-permissions',
  'refresh-configuration',
  'clear-configuration',
  'clear-all',
])

function coordinates(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid cache request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid cache request')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
  }
}

function managementRequest(input: unknown) {
  const repository = coordinates(input)
  const action = (input as Record<string, unknown>).action
  if (typeof action !== 'string' || !cacheActions.has(action as CacheAction)) {
    throw new Error('Invalid cache action')
  }
  return { ...repository, action: action as CacheAction }
}

function policy(
  data: ReturnType<typeof coordinates>,
  operation: 'cache.read' | 'cache.invalidate',
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

function cacheUser(user: {
  id: string
  email: string
  githubUsername?: string | null
}) {
  return {
    id: user.id,
    email: user.email,
    githubUsername: user.githubUsername ?? null,
  }
}

export const getCacheStatus = createServerFn({ method: 'GET' })
  .validator(coordinates)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      policy(data, 'cache.read', session.user.id),
      async () => {
        const { loadCacheStatus } =
          await import('#/server/cache-service.server')
        return loadCacheStatus({
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user: cacheUser(session.user),
          ...data,
        })
      },
    )
  })

export const updateCache = createServerFn({ method: 'POST' })
  .validator(managementRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      policy(data, 'cache.invalidate', session.user.id),
      async () => {
        const { manageCache } = await import('#/server/cache-service.server')
        return manageCache({
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user: cacheUser(session.user),
          ...data,
        })
      },
    )
  })
