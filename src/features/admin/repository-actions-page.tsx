import { getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { ActionsPage } from './actions-page'
import { ActionsEmpty } from './actions-empty'

const route = getRouteApi('/$owner/$repo/$branch/actions')
export function RepositoryActionsPage() {
  const params = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { data: workspace } = useSuspenseQuery(
    repositoryWorkspaceQueryOptions(params),
  )
  return workspace.configuration ? (
    <ActionsPage
      {...params}
      actionName={search.action}
      onActionFilter={(action) => void navigate({ search: { action } })}
    />
  ) : (
    <ActionsEmpty />
  )
}
