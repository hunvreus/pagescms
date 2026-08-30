import { createFileRoute } from '@tanstack/react-router'

import { MediaPage } from '#/features/media/media-page'

interface MediaSearch {
  path?: string
}

export const Route = createFileRoute('/$owner/$repo/$branch/media/$name')({
  validateSearch: (search: Record<string, unknown>): MediaSearch => ({
    path:
      typeof search.path === 'string' && search.path ? search.path : undefined,
  }),
  component: MediaRoute,
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
