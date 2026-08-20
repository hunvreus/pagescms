import { createFileRoute, redirect } from '@tanstack/react-router'

import {
  ContentEntryEditor,
  ContentEntrySkeleton,
} from '#/components/content-entry-editor'
import { getRawEntry } from '#/functions/entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute(
  '/$owner/$repo/$branch/collection/$name_/entry/$',
)({
  loader: async ({ params }) => {
    const path = params._splat
    if (!path) throw new Error('Entry path is required')
    try {
      return await getRawEntry({ data: { ...params, path } })
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
  staleTime: 10_000,
  pendingMs: 100,
  pendingComponent: ContentEntrySkeleton,
  component: CollectionEntryEditor,
})

function CollectionEntryEditor() {
  const initial = Route.useLoaderData()
  const params = Route.useParams()
  if (!params._splat) throw new Error('Entry path is required')
  return (
    <ContentEntryEditor
      afterDeleteHref={`/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}`}
      coordinates={{ ...params, path: params._splat }}
      initial={initial}
      renameBaseHref={`/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry`}
    />
  )
}
