import { findMediaSchema } from '#/shared/configuration-content'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import { requireRepositoryResource } from '#/features/repository/repository-route-resource'
import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'

import { MediaPage } from '#/features/media/media-page'
import { MediaPageSkeleton } from '#/features/media/media-skeleton'
import { mediaQueryOptions } from '#/client/queries/content'

export interface MediaSearch {
  path?: string
}

export const Route = createFileRoute(
  '/github/$owner/$repo/$branch/media/$name',
)({
  validateSearch: (search: Record<string, unknown>): MediaSearch => ({
    path:
      typeof search.path === 'string' && search.path ? search.path : undefined,
  }),
  loader: ({ context, params, location, preload }) => {
    requireRepositoryResource(context.queryClient, params, 'media')
    if (!preload) return
    const { path } = location.search as MediaSearch
    return context.queryClient.prefetchQuery(
      mediaQueryOptions({
        ...params,
        ...context.repositoryIdentity,
        path: typeof path === 'string' ? path : undefined,
      }),
    )
  },
  pendingMs: 0,
  pendingComponent: MediaPageSkeleton,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: MediaRoute,
  head: ({ params, match, matches }) => {
    const { i18n, queryClient } = matches[0].context
    const configuration = queryClient.getQueryData(
      repositoryQueryOptions(params).queryKey,
    )?.configuration?.object
    const media = configuration
      ? findMediaSchema(configuration, params.name)
      : undefined
    const label =
      typeof media?.label === 'string' && media.label
        ? media.label
        : params.name
    const implicit = media?.name === 'default' && !media.label
    return match.status === 'notFound' || match._notFound
      ? pageTitle(
          translateMessage(
            matches[0].context.i18n,
            msg({ message: 'Page not found' }),
          ),
          params,
        )
      : implicit
        ? pageTitle(
            translateMessage(
              i18n,
              match.search.path
                ? msg({ message: `Media | ${match.search.path}` })
                : msg({ message: 'Media' }),
            ),
            params,
          )
        : pageTitle(
            translateMessage(
              matches[0].context.i18n,
              msg({
                message: `Media | ${label}${match.search.path ? ` / ${match.search.path}` : ''}`,
              }),
            ),
            params,
          )
  },
})

function MediaRoute() {
  const coordinates = useRepositoryCoordinates(Route.useParams())
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <MediaPage
      coordinates={coordinates}
      path={search.path}
      onPathChange={(path) => {
        void navigate({ search: path ? { path } : {} })
      }}
    />
  )
}
