import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { ConfigurationPage } from './configuration-page'

const route = getRouteApi('/github/$owner/$repo/$branch/configuration')
export function RepositoryConfigurationPage() {
  const params = useRepositoryCoordinates(route.useParams())
  const { data: workspace } = useSuspenseQuery(repositoryQueryOptions(params))
  return (
    <ConfigurationPage
      key={`${params.owner}/${params.repo}/${params.branch}`}
      {...params}
      showGitHubLink={workspace.canViewGitHub}
    />
  )
}
