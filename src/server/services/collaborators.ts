import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { createGitHubAppApi } from '#/server/github/app'
import {
  listCollaborators,
  inviteCollaborators,
  removeCollaborator,
} from '#/server/collaborators/collaborators'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { RequestServices } from '#/server/context'
import type { ServiceUser } from '#/server/services/context'
import type {
  coordinates,
  inviteRequest,
  removeRequest,
} from '#/shared/requests/collaborator'

async function policy(
  data: ReturnType<typeof coordinates>,
  operation:
    'collaborator.read' | 'collaborator.invite' | 'collaborator.remove',
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
    target: {
      repository: data,
      branch: data.branch,
    },
  }
}

function manager(user: {
  id: string
  name: string
  email: string
  emailVerified: boolean
  githubUsername?: string | null
  image?: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    githubUsername: user.githubUsername ?? null,
    image: user.image ?? null,
  }
}

function installationLookup(services: RequestServices) {
  if (services.installationLookup) return services.installationLookup
  const configuration = services.configuration.githubApp
  return configuration
    ? createGitHubAppApi(configuration).getRepositoryInstallation
    : undefined
}

export async function readCollaborators(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof coordinates>,
) {
  return services.access.execute(
    await policy(data, 'collaborator.read', services, manager(user)),
    async () => {
      return listCollaborators(
        services.database,
        manager(user),
        data.owner,
        data.repo,
        services.repositoryAccess,
        installationLookup(services),
        data.repoId,
      )
    },
  )
}

export async function addCollaborators(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof inviteRequest>,
) {
  return services.access.execute(
    await policy(data, 'collaborator.invite', services, manager(user)),
    async () => {
      return inviteCollaborators({
        database: services.database,
        emailProvider: services.emailProvider,
        baseUrl: services.configuration.auth.baseUrl,
        defaultLanguage: services.configuration.defaultLanguage,
        user: manager(user),
        owner: data.owner,
        repo: data.repo,
        repoId: data.repoId,
        emails: data.emails,
        waitUntil: services.waitUntil,
        repositoryAccess: services.repositoryAccess,
        installationLookup: installationLookup(services),
      })
    },
  )
}

export async function deleteCollaborator(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof removeRequest>,
) {
  return services.access.execute(
    await policy(data, 'collaborator.remove', services, manager(user)),
    async () => {
      const removed = await removeCollaborator({
        database: services.database,
        user: manager(user),
        owner: data.owner,
        repo: data.repo,
        repoId: data.repoId,
        id: data.id,
        waitUntil: services.waitUntil,
        repositoryAccess: services.repositoryAccess,
        installationLookup: installationLookup(services),
      })
      return { id: removed.id }
    },
  )
}
