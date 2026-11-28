import { useLingui as useUiMessages } from '@lingui/react/macro'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { ActionsPage } from './actions-page'
import { ConfigurationRequired } from '#/features/repository/configuration-required'

const route = getRouteApi('/github/$owner/$repo/$branch/actions')
export function RepositoryActionsPage() {
  const { t: _t } = useUiMessages()

  const params = useRepositoryCoordinates(route.useParams())
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { data: workspace } = useSuspenseQuery(repositoryQueryOptions(params))
  return workspace.configuration ? (
    <ActionsPage
      {...params}
      actionName={search.action}
      onActionFilter={(action) => void navigate({ search: { action } })}
    />
  ) : (
    <ConfigurationRequired
      invalid={workspace.configurationInvalid}
      title={_t({ message: 'Actions' })}
      coordinates={params}
      canConfigure={workspace.canViewGitHub && workspace.repository.canPush}
    />
  )
}
