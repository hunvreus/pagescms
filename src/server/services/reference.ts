import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { loadReferenceOptions } from '#/server/content/reference'
import type { RequestServices } from '#/server/context'
import type { parseReferenceRequest } from '#/shared/requests/reference'
import type { serviceUserFromSession } from '#/server/services/context'

export async function readReferenceOptions(
  services: RequestServices,
  user: ReturnType<typeof serviceUserFromSession>,
  data: ReturnType<typeof parseReferenceRequest>,
) {
  return services.access.execute(
    {
      operation: 'reference.read',
      principal: await resolveRepositoryPrincipal(
        services.repositoryAccess,
        user,
        data,
      ),
      tenant: {
        type: 'repository',
        id: `${data.owner}/${data.repo}`.toLowerCase(),
      },
      target: {
        repository: data,
        branch: data.branch,
        collection: data.collection,
      },
    },
    async () => {
      return loadReferenceOptions({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
    },
  )
}
