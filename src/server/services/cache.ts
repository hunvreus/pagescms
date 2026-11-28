import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import {
  loadCacheStatus,
  manageCache,
  loadCacheFiles,
} from '#/server/services/cache-management'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { RequestServices } from '#/server/context'
import type { ServiceUser } from '#/server/services/context'
import type {
  coordinates,
  managementRequest,
  filesRequest,
} from '#/shared/requests/cache'

async function policy(
  data: ReturnType<typeof coordinates>,
  operation: 'cache.read' | 'cache.invalidate',
  services: RequestServices,
  user: RepositoryUser,
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
  emailVerified: boolean
  githubUsername?: string | null
}) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    githubUsername: user.githubUsername ?? null,
  }
}

export async function readCacheStatus(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof coordinates>,
) {
  return services.access.execute(
    await policy(data, 'cache.read', services, cacheUser(user)),
    () =>
      loadCacheStatus({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user: cacheUser(user),
        ...data,
      }),
  )
}

export async function manageRepositoryCache(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof managementRequest>,
) {
  return services.access.execute(
    await policy(data, 'cache.invalidate', services, cacheUser(user)),
    () =>
      manageCache({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user: cacheUser(user),
        ...data,
      }),
  )
}

export async function readCacheFiles(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof filesRequest>,
) {
  return services.access.execute(
    await policy(data, 'cache.read', services, cacheUser(user)),
    () =>
      loadCacheFiles({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user: cacheUser(user),
        ...data,
      }),
  )
}
