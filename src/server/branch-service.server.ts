import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

export async function createBranch(
  access: RepositoryAccessService,
  user: ProjectUser,
  input: { owner: string; repo: string; source: string; branch: string },
) {
  const source = await access.resolve(
    user,
    input.owner,
    input.repo,
    input.source,
  )
  await access.resolve(user, input.owner, input.repo, input.branch)
  return source.api.createBranch(
    input.owner,
    input.repo,
    input.branch,
    input.source,
  )
}
