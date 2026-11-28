import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import {
  isConfigurationEditingEnabled,
  isCacheManagementEnabled,
} from '#/shared/configuration-settings'
import { repositoryQueryOptions } from '#/client/queries/repository'

export async function ensureRepositoryAdmin(
  queryClient: QueryClient,
  params: { owner: string; repo: string; branch: string },
  page: 'configuration' | 'collaborators' | 'cache' | 'actions',
) {
  const repositoryData = await queryClient.ensureQueryData(
    repositoryQueryOptions(params),
  )
  const discovery = repositoryData.discovery
  const allowed =
    repositoryData.canViewGitHub &&
    (page === 'configuration'
      ? isConfigurationEditingEnabled(
          repositoryData.configuration?.object ?? {},
        )
      : page === 'cache'
        ? repositoryData.repository.canPush &&
          isCacheManagementEnabled(repositoryData.configuration?.object)
        : page === 'actions'
          ? discovery.visibility === 'all' ||
            (discovery.visibility === 'filtered' &&
              discovery.resources.some(
                (resource) => resource.type === 'action',
              ))
          : true)
  if (!allowed) throw redirect({ to: '/github/$owner/$repo/$branch', params })
}
