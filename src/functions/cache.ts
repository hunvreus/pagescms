import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'
import { resolveRepositoryPrincipal } from '#/server/repository-policy.server'

import type { CacheAction } from '#/server/cache-service.server'
import type { ProjectUser } from '#/server/projects.server'
import type { RequestServices } from '#/server/request-services.server'

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

async function policy(
  data: ReturnType<typeof coordinates>,
  operation: 'cache.read' | 'cache.invalidate',
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
      await policy(data, 'cache.read', services, cacheUser(session.user)),
      async () => {
        const { loadCacheStatus } =
          await import('#/server/cache-service.server')
        return loadCacheStatus({
          database: services.cacheDatabase,
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
      await policy(data, 'cache.invalidate', services, cacheUser(session.user)),
      async () => {
        const { manageCache } = await import('#/server/cache-service.server')
        return manageCache({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user: cacheUser(session.user),
          ...data,
        })
      },
    )
  })
