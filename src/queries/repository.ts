import { queryOptions } from '@tanstack/react-query'

import { getActions } from '#/functions/actions'
import { getCacheStatus } from '#/functions/cache'
import { getCollaborators } from '#/functions/collaborators'
import {
  getRepositoryWorkspace,
  getRepositoryBranches,
} from '#/functions/repository'

import { queryKeys, queryTimes } from './keys'

interface RepositoryRef {
  owner: string
  repo: string
}

interface BranchRef extends RepositoryRef {
  branch: string
}

export function repositoryBranchesQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'branches'] as const,
    queryFn: () => getRepositoryBranches({ data: input }),
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
  })
}

export function repositoryWorkspaceQueryOptions(
  input: RepositoryRef & { branch?: string },
) {
  const queryKey = input.branch
    ? ([
        ...queryKeys.branch({ ...input, branch: input.branch }),
        'workspace',
      ] as const)
    : ([...queryKeys.repository(input), 'workspace'] as const)
  return queryOptions({
    queryKey,
    queryFn: () => getRepositoryWorkspace({ data: input }),
    staleTime: queryTimes.minute,
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
    queryFn: () => getActions({ data: { ...input, includeRuns } }),
    staleTime: 5_000,
    gcTime: queryTimes.gc,
  })
}

export function cacheStatusQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'cache'] as const,
    queryFn: () => getCacheStatus({ data: input }),
    staleTime: 15_000,
    gcTime: queryTimes.gc,
  })
}

export function collaboratorsQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'collaborators'] as const,
    queryFn: () => getCollaborators({ data: input }),
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
  })
}
