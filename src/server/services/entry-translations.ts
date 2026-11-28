import { loadEntryTranslations } from '#/server/content/entry-editor'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { repositoryTenant } from '#/server/services/context'
import { normalizeGitPath } from '#/shared/git-path'
import type { ServiceContext, ServiceUser } from '#/server/services/context'
import type { parseEntryRequest } from '#/shared/requests/entry'

export async function readEntryTranslations(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseEntryRequest>,
) {
  const path = normalizeGitPath(data.path)
  const request = {
    operation: 'entry.read' as const,
    principal: await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      data,
    ),
    tenant: repositoryTenant(data),
    target: {
      repository: data,
      branch: data.branch,
      collection: data.name,
      path,
    },
  }
  return services.access.execute(request, () =>
    loadEntryTranslations({
      ...data,
      path,
      database: services.cacheDatabase,
      repositoryAccess: services.repositoryAccess,
      user,
      authorizeRead: async (translatedPath) => {
        await services.access.authorize({
          ...request,
          target: { ...request.target, path: translatedPath },
        })
      },
    }),
  )
}
