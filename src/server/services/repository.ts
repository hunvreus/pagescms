import { createBranch } from '#/server/repository/branches'
import { repositoryActions } from '#/lib/actions'
import {
  filterConfigurationForDiscovery,
  getConfigurationActionNames,
} from '#/shared/configuration-discovery'
import { getConfigurationNavigation } from '#/shared/configuration-navigation'
import { collaboratorBranches } from '#/server/collaborators/branches'
import { AccessDeniedError } from '#/server/access/policy'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { repositoryTenant } from '#/server/services/context'

import type { ServiceContext, ServiceUser } from '#/server/services/context'
import type { parseBranchCreate } from '#/shared/requests/branch'

type RepositoryInput = {
  owner: string
  repo: string
  repoId?: string
  branch?: string
}

/**
 * Opens a repository branch and returns configuration filtered to the
 * resources the principal may discover.
 */
export async function readRepository(
  services: ServiceContext,
  user: ServiceUser,
  data: RepositoryInput,
) {
  const principal = await resolveRepositoryPrincipal(
    services.repositoryAccess,
    user,
    data,
  )
  const selectedBranch =
    principal.type === 'collaborator'
      ? (await collaboratorBranches(services, user, data, data.branch, true))[0]
      : data.branch
  if (principal.type === 'collaborator' && !selectedBranch)
    throw new AccessDeniedError({ allowed: false, reason: 'permission_denied' })
  const tenant = repositoryTenant(data)
  const target = {
    repository: { owner: data.owner, repo: data.repo, repoId: data.repoId },
    ...(selectedBranch ? { branch: selectedBranch } : {}),
  }
  return services.access.execute(
    { operation: 'repository.read', principal, tenant, target },
    async (grant) => {
      const repositoryData = await services.repositories.openRepository(
        user,
        data.owner,
        data.repo,
        selectedBranch,
        data.repoId,
      )
      const configuration = repositoryData.configuration?.object
      if (!configuration) {
        return {
          ...repositoryData,
          canViewGitHub: principal.type === 'user',
          runnableRepositoryActions: [] as string[],
          discovery: { visibility: 'all' as const },
        }
      }
      const navigation = getConfigurationNavigation(configuration)
      const actions = repositoryActions(configuration)
      const [discovery, executable] = await Promise.all([
        services.access.discover({
          principal,
          tenant,
          target,
          resources: [
            ...navigation.flatMap((item) => [
              {
                type:
                  item.type === 'file' ? ('collection' as const) : item.type,
                name: item.name,
              },
            ]),
            ...getConfigurationActionNames(configuration).map((name) => ({
              type: 'action' as const,
              name,
            })),
          ],
        }),
        actions.length &&
        ((principal.type === 'user' && repositoryData.repository.canPush) ||
          grant?.delegatedOperations?.includes('action.run') === true)
          ? services.access.discover({
              principal,
              tenant,
              target,
              operation: 'action.run',
              resources: actions.map((action) => ({
                type: 'action' as const,
                name: action.name,
              })),
            })
          : { visibility: 'none' as const },
      ])
      return {
        ...repositoryData,
        canViewGitHub: principal.type === 'user',
        runnableRepositoryActions: actions
          .filter(
            (action) =>
              executable.visibility === 'all' ||
              (executable.visibility === 'filtered' &&
                executable.resources.some(
                  (resource) =>
                    resource.type === 'action' && resource.name === action.name,
                )),
          )
          .map((action) => action.name),
        configuration: repositoryData.configuration
          ? {
              ...repositoryData.configuration,
              object: filterConfigurationForDiscovery(configuration, discovery),
            }
          : null,
        discovery,
      }
    },
  )
}

export async function listRepositoryBranches(
  services: ServiceContext,
  user: ServiceUser,
  data: RepositoryInput,
) {
  const principal = await resolveRepositoryPrincipal(
    services.repositoryAccess,
    user,
    data,
  )
  if (principal.type === 'collaborator')
    return collaboratorBranches(services, user, data)
  return services.access.execute(
    {
      operation: 'repository.read',
      principal,
      tenant: repositoryTenant(data),
      target: {
        repository: data,
        ...(data.branch ? { branch: data.branch } : {}),
      },
    },
    async () => {
      const { api } = await services.repositoryAccess.resolve(
        user,
        data.owner,
        data.repo,
        data.branch,
        data.repoId,
      )
      return api.listBranches(data.owner, data.repo)
    },
  )
}

export async function createRepositoryBranch(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseBranchCreate>,
) {
  return services.access.execute(
    {
      operation: 'branch.create',
      principal: await resolveRepositoryPrincipal(
        services.repositoryAccess,
        user,
        { ...data, branch: data.source },
      ),
      tenant: {
        type: 'repository',
        id: `${data.owner}/${data.repo}`.toLowerCase(),
      },
      target: {
        repository: data,
        branch: data.branch,
      },
    },
    async () => {
      return createBranch(services.repositoryAccess, user, data)
    },
  )
}
