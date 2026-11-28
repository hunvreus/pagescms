import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { repositoryPageKey } from '#/lib/repository-page-path'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import deployment from '#pagescms/deployment/client'
import { RepositoryPluginPage } from '#/features/admin/plugin-page'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { pageTitle } from '#/lib/page-title'

export const Route = createFileRoute('/github/$owner/$repo/$branch/$page')({
  loader: async ({ context, params }) => {
    if (!repositoryPageKey(deployment.repositoryPages, params.page))
      throw notFound()
    const repositoryData = await context.queryClient.ensureQueryData(
      repositoryQueryOptions(params),
    )
    if (!repositoryData.canViewGitHub || !repositoryData.repository.canPush)
      throw redirect({ to: '/github/$owner/$repo/$branch', params })
  },
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: () => (
    <RepositoryPluginPage {...useRepositoryCoordinates(Route.useParams())} />
  ),
  head: ({ params, matches, match }) => {
    if (match.status === 'notFound' || match._notFound)
      return pageTitle(
        translateMessage(
          matches[0].context.i18n,
          msg({ message: 'Page not found' }),
        ),
        params,
      )

    const key = repositoryPageKey(deployment.repositoryPages, params.page)
    return pageTitle(
      key
        ? translateMessage(
            matches[0].context.i18n,
            deployment.repositoryPages[key].label,
          )
        : translateMessage(
            matches[0].context.i18n,
            msg({ message: 'Page not found' }),
          ),
      params,
    )
  },
})
