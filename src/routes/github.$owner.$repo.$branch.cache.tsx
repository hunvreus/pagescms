import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { CachePage } from '#/features/admin/cache-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { CacheSkeleton } from '#/features/admin/cache-skeleton'
import { cacheStatusQueryOptions } from '#/client/queries/repository'

export const Route = createFileRoute('/github/$owner/$repo/$branch/cache')({
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'cache')
    await context.queryClient.ensureQueryData(
      cacheStatusQueryOptions({ ...params, ...context.repositoryIdentity }),
    )
  },
  pendingComponent: () => <CacheSkeleton />,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: () => (
    <CachePage {...useRepositoryCoordinates(Route.useParams())} />
  ),
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
          translateMessage(matches[0].context.i18n, msg({ message: 'Cache' })),
          params,
        ),
})
