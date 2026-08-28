import { lazy, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clientDeployment from '#pagescms/deployment/client'

import { OperationError } from '#/components/operation-error'
import { Skeleton } from '#/components/ui/skeleton'
import {
  getRepositoryPermissions,
  replaceRepositoryPermissions,
} from '#/functions/repository-permissions'
import { queryKeys, queryTimes } from '#/queries/keys'

import type { RepositoryPermissionGrant } from '#/deployment/contracts/hosted.server'

const loadContribution = clientDeployment.ui?.repositoryPermissions
const RepositoryPermissions = loadContribution ? lazy(loadContribution) : null

export function RepositoryPermissionsContribution({
  branch,
  owner,
  repo,
}: {
  branch: string
  owner: string
  repo: string
}) {
  const queryClient = useQueryClient()
  const queryKey = [
    ...queryKeys.repository({ owner, repo }),
    'permissions',
  ] as const
  const query = useQuery({
    queryKey,
    queryFn: () => getRepositoryPermissions({ data: { branch, owner, repo } }),
    enabled: Boolean(RepositoryPermissions),
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
  })

  if (!RepositoryPermissions) return null
  if (query.isPending) {
    return (
      <Skeleton
        aria-label="Loading repository permissions"
        className="h-48 w-full rounded-xl"
      />
    )
  }
  if (query.isError) {
    return (
      <OperationError
        error={query.error}
        fallback="Could not load repository permissions."
      />
    )
  }

  return (
    <Suspense
      fallback={
        <Skeleton
          aria-label="Loading repository permissions"
          className="h-48 w-full rounded-xl"
        />
      }
    >
      <RepositoryPermissions
        branch={branch}
        disabled={query.isFetching}
        owner={owner}
        repo={repo}
        snapshot={query.data}
        onReplace={async ({ expectedVersion, grants }) => {
          const snapshot = await replaceRepositoryPermissions({
            data: {
              branch,
              owner,
              repo,
              expectedVersion,
              grants: grants as RepositoryPermissionGrant[],
            },
          })
          queryClient.setQueryData(queryKey, snapshot)
          return snapshot
        }}
      />
    </Suspense>
  )
}
