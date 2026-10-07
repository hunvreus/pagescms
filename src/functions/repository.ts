import { createServerFn } from '@tanstack/react-start'

import {
  filterConfigurationForDiscovery,
  getConfigurationActionNames,
} from '#/lib/configuration-discovery'
import { getConfigurationNavigation } from '#/lib/configuration-navigation'
import { branchName, repositoryRef } from '#/lib/repository'
import {
  configuredCollaboratorBranches,
  NoConfiguredBranchesError,
} from '#/server/configured-branches.server'
import { resolveRepositoryPrincipal } from '#/server/repository-policy.server'

import type { RequestServices } from '#/server/request-services.server'

function parseRepositoryRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid repository request')
  }
  const value = input as Record<string, unknown>
  if (typeof value.owner !== 'string' || typeof value.repo !== 'string') {
    throw new Error('Invalid repository request')
  }
  const repository = repositoryRef({ owner: value.owner, repo: value.repo })
  const branch =
    typeof value.branch === 'string' && value.branch ? value.branch : undefined
  const hasControlCharacter = branch
    ? Array.from(branch).some((character) => {
        const code = character.codePointAt(0)
        return code !== undefined && (code <= 31 || code === 127)
      })
    : false
  if (branch && (branch.length > 255 || hasControlCharacter)) {
    throw new Error('Invalid branch name')
  }
  return { ...repository, branch }
}

export function parseBranchCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid branch creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    typeof value.source !== 'string'
  ) {
    throw new Error('Invalid branch creation')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: branchName(value.branch),
    source: branchName(value.source),
  }
}

function authenticatedProjectUser(
  session: Awaited<ReturnType<RequestServices['getSession']>>,
) {
  if (!session?.user) throw new Error('Authentication required')
  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    githubUsername: session.user.githubUsername ?? null,
  }
}

export const getRepositoryWorkspace = createServerFn({ method: 'GET' })
  .validator(parseRepositoryRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = authenticatedProjectUser(await services.getSession())
    const principal = await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      { owner: data.owner, repo: data.repo },
    )
    const selectedBranch =
      principal.type === 'collaborator'
        ? (
            await configuredCollaboratorBranches(
              services,
              user,
              data,
              data.branch,
              true,
            )
          )[0]
        : data.branch
    if (principal.type === 'collaborator' && !selectedBranch)
      throw new NoConfiguredBranchesError()
    const tenant = {
      type: 'repository' as const,
      id: `${data.owner.toLowerCase()}/${data.repo.toLowerCase()}`,
    }
    const target = {
      repository: { owner: data.owner, repo: data.repo },
      ...(selectedBranch ? { branch: selectedBranch } : {}),
    }
    return services.access.execute(
      {
        operation: 'repository.read',
        principal,
        tenant,
        target,
      },
      async () => {
        const workspace = await services.projects.openRepository(
          user,
          data.owner,
          data.repo,
          selectedBranch,
        )
        const configuration = workspace.configuration?.object
        if (!configuration) {
          return {
            ...workspace,
            canViewGitHub: principal.type === 'user',
            discovery: { visibility: 'all' as const },
          }
        }
        const navigation = getConfigurationNavigation(configuration)
        const discovery = await services.access.discover({
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
        })
        return {
          ...workspace,
          canViewGitHub: principal.type === 'user',
          configuration: workspace.configuration
            ? {
                ...workspace.configuration,
                object: filterConfigurationForDiscovery(
                  configuration,
                  discovery,
                ),
              }
            : null,
          discovery,
        }
      },
    )
  })

export const createRepositoryBranch = createServerFn({ method: 'POST' })
  .validator(parseBranchCreate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = authenticatedProjectUser(await services.getSession())
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
        const { createBranch } = await import('#/server/branch-service.server')
        return createBranch(services.repositoryAccess, user, data)
      },
    )
  })

export const getRepositoryBranches = createServerFn({ method: 'GET' })
  .validator(parseRepositoryRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = authenticatedProjectUser(await services.getSession())
    const principal = await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      { owner: data.owner, repo: data.repo },
    )
    if (principal.type === 'collaborator')
      return configuredCollaboratorBranches(services, user, data)
    return services.access.execute(
      {
        operation: 'repository.read',
        principal,
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
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
        )
        return api.listBranches(data.owner, data.repo)
      },
    )
  })
