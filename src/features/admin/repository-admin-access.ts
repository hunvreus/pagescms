import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import {
  isConfigurationEditingEnabled,
  isCacheManagementEnabled,
} from '#/lib/configuration'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'

export async function ensureRepositoryAdmin(
  queryClient: QueryClient,
  params: { owner: string; repo: string; branch: string },
  page: 'configuration' | 'collaborators' | 'cache' | 'actions',
) {
  const workspace = await queryClient.ensureQueryData(
    repositoryWorkspaceQueryOptions(params),
  )
  const discovery = workspace.discovery
  const allowed =
    workspace.canViewGitHub &&
    (page === 'configuration'
      ? isConfigurationEditingEnabled(workspace.configuration?.object ?? {})
      : page === 'cache'
        ? workspace.repository.canPush &&
          isCacheManagementEnabled(workspace.configuration?.object)
        : page === 'actions'
          ? discovery.visibility === 'all' ||
            (discovery.visibility === 'filtered' &&
              discovery.resources.some(
                (resource) => resource.type === 'action',
              ))
          : true)
  if (!allowed) throw redirect({ to: '/$owner/$repo/$branch', params })
}
