import type { AccessPrincipal } from './access-policy.server'
import type { RepositoryAccessService } from './repository-access.server'
import type { ProjectUser } from './projects.server'

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
  }
}
