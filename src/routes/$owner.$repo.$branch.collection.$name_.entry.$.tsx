import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { ContentEntryEditor } from '#/components/content-entry-editor'
import { ContentEntrySkeleton } from '#/components/content-entry-skeleton'
import { getSignInUrl } from '#/lib/auth-redirect'
import { entryQueryOptions } from '#/queries/content'

export const Route = createFileRoute(
  '/$owner/$repo/$branch/collection/$name_/entry/$',
)({
  loader: async ({ context, params }) => {
    const path = params._splat
    if (!path) throw new Error('Entry path is required')
    try {
      await context.queryClient.ensureQueryData(
        entryQueryOptions({ ...params, path }),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry/${path}`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: ContentEntrySkeleton,
  component: CollectionEntryEditor,
})

function CollectionEntryEditor() {
  const params = Route.useParams()
  const path = params._splat!
  const { data: initial } = useSuspenseQuery(
    entryQueryOptions({ ...params, path }),
  )
  return (
    <ContentEntryEditor
      afterDeleteHref={`/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}`}
      coordinates={{ ...params, path }}
      initial={initial}
      renameBaseHref={`/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry`}
    />
  )
}
