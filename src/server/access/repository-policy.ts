import { AccessDeniedError } from '#/server/access/policy'
import type { AccessPrincipal } from '#/server/access/policy'
import type {
  RepositoryAccess,
  RepositoryAccessService,
} from '#/server/access/repository'
import type { RepositoryUser } from '#/server/repository/repositories'

export async function requireRepositoryManager(
  repositoryAccess: RepositoryAccessService,
  user: RepositoryUser,
  repository: { owner: string; repo: string; branch: string; repoId?: string },
) {
  const admission = await repositoryAccess.resolve(
    user,
    repository.owner,
    repository.repo,
    repository.branch,
    ...('repoId' in repository && typeof repository.repoId === 'string'
      ? [repository.repoId]
      : []),
  )
  if (admission.tokenSource !== 'user') {
    throw new AccessDeniedError(
      { allowed: false, reason: 'permission_denied' },
      'Only GitHub users with repository write access can manage this repository',
    )
  }
  const metadata =
    admission.repository ??
    (await admission.api.getRepository(repository.owner, repository.repo))
  if (!metadata.canPush)
    throw new AccessDeniedError(
      { allowed: false, reason: 'permission_denied' },
      'Repository write access is required',
    )
  return { ...admission, repository: metadata }
}

export async function resolveRepositoryPrincipal(
  repositoryAccess: RepositoryAccessService,
  user: RepositoryUser,
  repository: {
    owner: string
    repo: string
    branch?: string
    repoId?: string
  },
): Promise<AccessPrincipal> {
  const admission = await repositoryAccess.resolve(
    user,
    repository.owner,
    repository.repo,
    repository.branch,
    ...('repoId' in repository && typeof repository.repoId === 'string'
      ? [repository.repoId]
      : []),
  )
  return repositoryAdmissionPrincipal(user, admission)
}

export function repositoryAdmissionPrincipal(
  user: RepositoryUser,
  admission: RepositoryAccess,
): AccessPrincipal {
  return {
    type: admission.tokenSource === 'installation' ? 'collaborator' : 'user',
    id: user.id,
    ...(admission.collaboratorKey
      ? { collaboratorKey: admission.collaboratorKey }
      : {}),
    ...(admission.membershipId ? { membershipId: admission.membershipId } : {}),
    ...(admission.identity
      ? {
          repositoryIdentity: {
            source: admission.identity.source,
            externalId: admission.identity.externalId,
            ...(admission.repository
              ? { ownerId: String(admission.repository.ownerId) }
              : {}),
          },
        }
      : {}),
  }
}
