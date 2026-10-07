import {
  repositoryWorkspaceQueryOptions,
  repositoryBranchesQueryOptions,
  collaboratorsQueryOptions,
} from '#/queries/repository'
import { getConfigurationNavigation } from '#/lib/configuration-navigation'
import { getConfigurationActionNames } from '#/lib/configuration-discovery'
import { lazy, Suspense } from 'react'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import clientDeployment from '#pagescms/deployment/client'

import { OperationError } from '#/components/operation-error'
import { Skeleton } from '#/components/ui/skeleton'
import {
  getRepositoryPermissions,
  replaceRepositoryPermissions,
} from '#/functions/repository-permissions'
import { addCollaborators, deleteCollaborator } from '#/functions/collaborators'
import { queryKeys, queryTimes } from '#/queries/keys'

import type {
  RepositoryRole,
  RepositoryRoleAssignment,
} from '#/deployment/contracts/hosted.server'

const loadContribution = clientDeployment.ui?.repositoryPermissions
export const hasRepositoryCollaborators = Boolean(loadContribution)
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
  const workspace = useSuspenseQuery(
    repositoryWorkspaceQueryOptions({ owner, repo, branch }),
  ).data
  const params = { owner, repo, branch }
  const collaborators = useSuspenseQuery(collaboratorsQueryOptions(params)).data
  const branches = useSuspenseQuery(repositoryBranchesQueryOptions(params)).data
  const config = workspace.configuration?.object ?? {}
  const resources = [
    ...getConfigurationNavigation(config).map((item) => ({
      type: item.type === 'file' ? ('collection' as const) : item.type,
      name: item.name,
    })),
    ...getConfigurationActionNames(config).map((name) => ({
      type: 'action' as const,
      name,
    })),
  ]
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
        collaborators={collaborators}
        branches={branches}
        onInvite={async (selection) => {
          try {
            await addCollaborators({
              data: {
                ...params,
                emails: selection.emails,
                permissions: {
                  expectedVersion: selection.expectedVersion,
                  roles: [...selection.roles],
                  branches:
                    selection.branches === 'all'
                      ? 'all'
                      : [...selection.branches],
                },
              },
            })
          } finally {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey }),
              queryClient.invalidateQueries({
                queryKey: collaboratorsQueryOptions(params).queryKey,
              }),
            ])
          }
        }}
        onRemove={async (id) => {
          await deleteCollaborator({ data: { ...params, id } })
          await queryClient.invalidateQueries({
            queryKey: collaboratorsQueryOptions(params).queryKey,
          })
        }}
        resources={resources}
        snapshot={query.data}
        onReplace={async ({ expectedVersion, roles, assignments }) => {
          const snapshot = await replaceRepositoryPermissions({
            data: {
              branch,
              owner,
              repo,
              expectedVersion,
              roles: roles as RepositoryRole[],
              assignments: assignments as RepositoryRoleAssignment[],
            },
          })
          queryClient.setQueryData(queryKey, snapshot)
          return snapshot
        }}
      />
    </Suspense>
  )
}
