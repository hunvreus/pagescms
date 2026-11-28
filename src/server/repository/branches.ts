import type { RepositoryUser } from './repositories'
import type { RepositoryAccessService } from '#/server/access/repository'

export async function createBranch(
  access: RepositoryAccessService,
  user: RepositoryUser,
  input: {
    owner: string
    repo: string
    repoId?: string
    source: string
    branch: string
  },
) {
  const source = await access.resolve(
    user,
    input.owner,
    input.repo,
    input.source,
    input.repoId,
  )
  await access.resolve(
    user,
    input.owner,
    input.repo,
    input.branch,
    input.repoId,
  )
  return source.api.createBranch(
    input.owner,
    input.repo,
    input.branch,
    input.source,
  )
}
