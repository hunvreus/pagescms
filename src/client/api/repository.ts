import type {
  readRepository as getRepository,
  createRepositoryBranch as createBranch,
  listRepositoryBranches,
} from '#/server/services/repository'
import { apiMutation, readApi } from '#/client/api/index'

type Input = { owner: string; repo: string; repoId?: string; branch?: string }

function query(input: Input) {
  const params = new URLSearchParams({ owner: input.owner, repo: input.repo })
  if (input.repoId) params.set('repoId', input.repoId)
  if (input.branch) params.set('branch', input.branch)
  return params
}

export async function readRepositoryData(
  input: Input,
): ReturnType<typeof getRepository> {
  const repositoryData = await readApi<
    Awaited<ReturnType<typeof getRepository>>
  >(`/api/repository?${query(input)}`)
  if (repositoryData.configuration)
    repositoryData.configuration.lastCheckedAt = new Date(
      repositoryData.configuration.lastCheckedAt,
    )
  return repositoryData
}

export async function readBranches(
  input: Input,
): ReturnType<typeof listRepositoryBranches> {
  return readApi(`/api/branches?${query(input)}`)
}

export const createRepositoryBranch = apiMutation<
  unknown,
  Awaited<ReturnType<typeof createBranch>>
>('/api/branches')
