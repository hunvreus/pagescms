import { rememberRepositoryIdentity } from '#/lib/repository-identity'
import { queryOptions } from '@tanstack/react-query'

import { readActions } from '#/client/api/actions'
import { getCacheStatus } from '#/client/api/cache'
import { getCollaborators } from '#/client/api/collaborators'
import { readRepositoryData, readBranches } from '#/client/api/repository'

import { queryKeys, queryTimes } from './keys'

interface RepositoryRef {
  repoId?: string
  source?: string
  owner: string
  repo: string
}

interface BranchRef extends RepositoryRef {
  branch: string
}

export function repositoryBranchesQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'branches'] as const,
    queryFn: () => readBranches(input),
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
  })
}

export function repositoryQueryOptions(
  input: RepositoryRef & { branch?: string },
) {
  // Repository bootstrap is addressed by URL; all content scopes receive an
  // explicit verified ID from the parent route before their loaders run.
  const address = { ...input, repoId: undefined }
  const queryKey = input.branch
    ? ([
        ...queryKeys.branch({ ...address, branch: input.branch }),
        'details',
      ] as const)
    : ([...queryKeys.repository(address), 'details'] as const)
  return queryOptions({
    queryKey,
    queryFn: async () => {
      const repositoryData = await readRepositoryData(input)
      rememberRepositoryIdentity(
        { ...repositoryData.repository, source: repositoryData.source },
        input,
      )
      return repositoryData
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    gcTime: queryTimes.gc,
  })
}

export function actionsQueryOptions(input: BranchRef, includeRuns = true) {
  return queryOptions({
    queryKey: [
      ...queryKeys.branch(input),
      'actions',
      includeRuns ? 'runs' : 'list',
    ] as const,
    queryFn: () => readActions({ ...input, includeRuns }),
    staleTime: 5_000,
    // The shared tracker owns focus/reconnect status updates for the runs table.
    refetchOnWindowFocus: !includeRuns,
    refetchOnReconnect: !includeRuns,
    gcTime: queryTimes.gc,
  })
}

export function cacheStatusQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'cache'] as const,
    queryFn: () => getCacheStatus(input),
    staleTime: 15_000,
    gcTime: queryTimes.gc,
  })
}

export function collaboratorsQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'collaborators'] as const,
    queryFn: () => getCollaborators(input),
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
  })
}
