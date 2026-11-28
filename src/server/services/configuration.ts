import {
  loadConfigurationSource,
  saveConfigurationSource,
} from '#/server/services/configuration-editor'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import type { ServiceUser } from '#/server/services/context'
import type { RequestServices } from '#/server/context'
import type {
  configurationCoordinates,
  configurationSave,
  configurationHistory,
} from '#/shared/requests/configuration'
import type { AccessRequest } from '#/server/access/policy'

type Coordinates = ReturnType<typeof configurationCoordinates>

async function request(
  services: RequestServices,
  user: ServiceUser,
  data: Coordinates,
  operation:
    'configuration.read' | 'configuration.update' | 'configuration.history',
): Promise<AccessRequest> {
  return {
    operation,
    principal: await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      data,
    ),
    tenant: {
      type: 'repository',
      id: `${data.owner}/${data.repo}`.toLowerCase(),
    },
    target: { repository: data, branch: data.branch, path: '.pages.yml' },
  }
}

export async function readConfiguration(
  services: RequestServices,
  user: ServiceUser,
  data: Coordinates,
) {
  return services.access.execute(
    await request(services, user, data, 'configuration.read'),
    async () => {
      return loadConfigurationSource({
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
    },
  )
}

export async function writeConfiguration(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof configurationSave>,
) {
  return services.access.execute(
    {
      ...(await request(services, user, data, 'configuration.update')),
      facts: { newFile: !data.sha },
    },
    async () => {
      return saveConfigurationSource({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
    },
  )
}

export async function readConfigurationHistory(
  services: RequestServices,
  user: ServiceUser,
  input: ReturnType<typeof configurationHistory>,
) {
  const { page, ...data } = input
  return services.access.execute(
    await request(services, user, data, 'configuration.history'),
    async () => {
      const { api } = await services.repositoryAccess.resolve(
        user,
        data.owner,
        data.repo,
        data.branch,
        data.repoId,
      )
      return api.listFileCommits(
        data.owner,
        data.repo,
        data.branch,
        '.pages.yml',
        page,
      )
    },
  )
}
