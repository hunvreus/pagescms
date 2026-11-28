import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { RepositoryOverview } from '#/features/repository/overview'
import { ConfigurationRequired } from '#/features/repository/configuration-required'
import { OverviewSkeleton } from '#/features/repository/overview-loading'
import { repositoryQueryOptions } from '#/client/queries/repository'

export const Route = createFileRoute('/github/$owner/$repo/$branch/')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(repositoryQueryOptions(params)),
  pendingMs: 120,
  pendingComponent: OverviewSkeleton,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: RepositoryHome,
  head: ({ params, matches, match }) =>
    match.status === 'notFound' || match._notFound
      ? pageTitle(
          translateMessage(
            matches[0].context.i18n,
            msg({ message: 'Page not found' }),
          ),
          params,
        )
      : pageTitle(
          translateMessage(
            matches[0].context.i18n,
            msg({ message: 'Overview' }),
          ),
          params,
        ),
})

function RepositoryHome() {
  const coordinates = useRepositoryCoordinates(Route.useParams())
  const { data: workspace } = useSuspenseQuery(
    repositoryQueryOptions(coordinates),
  )
  return workspace.configuration ? (
    <RepositoryOverview coordinates={coordinates} />
  ) : (
    <ConfigurationRequired
      invalid={workspace.configurationInvalid}
      coordinates={coordinates}
      canConfigure={workspace.canViewGitHub && workspace.repository.canPush}
    />
  )
}
