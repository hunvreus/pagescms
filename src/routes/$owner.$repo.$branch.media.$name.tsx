import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'

import { MediaPage } from '#/features/media/media-page'
import { mediaQueryOptions } from '#/queries/content'

interface MediaSearch {
  path?: string
}

export const Route = createFileRoute('/$owner/$repo/$branch/media/$name')({
  validateSearch: (search: Record<string, unknown>): MediaSearch => ({
    path:
      typeof search.path === 'string' && search.path ? search.path : undefined,
  }),
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: ({ context, params, deps, preload }) => {
    if (!preload) return
    return context.queryClient.prefetchQuery(
      mediaQueryOptions({ ...params, path: deps.path }),
    )
  },
  component: MediaRoute,
  head: ({ params, match }) =>
    pageTitle(
      `Media | ${params.name}${match.loaderDeps.path ? ` / ${match.loaderDeps.path}` : ''}`,
      params,
    ),
})

function MediaRoute() {
  const coordinates = Route.useParams()
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
