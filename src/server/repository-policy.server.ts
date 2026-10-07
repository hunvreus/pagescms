import type { AccessPrincipal } from './access-policy.server'
import type { RepositoryAccessService } from './repository-access.server'
import type { ProjectUser } from './projects.server'

export async function requireRepositoryManager(
  repositoryAccess: RepositoryAccessService,
  user: ProjectUser,
  repository: { owner: string; repo: string; branch: string },
) {
  const admission = await repositoryAccess.resolve(
    user,
    repository.owner,
    repository.repo,
    repository.branch,
  )
  if (admission.tokenSource !== 'user') {
    throw new Error(
      'Only GitHub users with repository write access can manage this repository',
    )
  }
  const metadata = await admission.api.getRepository(
    repository.owner,
    repository.repo,
  )
  if (!metadata.canPush) throw new Error('Repository write access required')
  return admission
}

export async function resolveRepositoryPrincipal(
  repositoryAccess: RepositoryAccessService,
  user: ProjectUser,
  repository: {
    owner: string
    repo: string
    branch?: string
  },
): Promise<AccessPrincipal> {
  const admission = await repositoryAccess.resolve(
    user,
    repository.owner,
    repository.repo,
    repository.branch,
  )
  return {
    type: admission.tokenSource === 'installation' ? 'collaborator' : 'user',
    id: user.id,
    ...(admission.collaboratorKey
      ? { collaboratorKey: admission.collaboratorKey }
      : {}),
  }
}
