import { getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { ConfigurationPage } from './configuration-page'

const route = getRouteApi('/$owner/$repo/$branch/configuration')
export function RepositoryConfigurationPage() {
  const params = route.useParams()
  const { data: workspace } = useSuspenseQuery(
    repositoryWorkspaceQueryOptions(params),
  )
  return (
    <ConfigurationPage
      key={`${params.owner}/${params.repo}/${params.branch}`}
      {...params}
      showGitHubLink={workspace.canViewGitHub}
    />
  )
}
