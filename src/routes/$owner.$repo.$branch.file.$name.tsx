import { createFileRoute, redirect } from '@tanstack/react-router'

import {
  ContentEntryEditor,
  ContentEntrySkeleton,
} from '#/components/content-entry-editor'
import { getFixedFile } from '#/functions/file-editor'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute('/$owner/$repo/$branch/file/$name')({
  loader: async ({ params }) => {
    try {
      return await getFixedFile({ data: params })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/file/${encodeURIComponent(params.name)}`,
          ),
        })
      }
      throw error
    }
  },
  staleTime: 10_000,
  pendingMs: 100,
  pendingComponent: ContentEntrySkeleton,
  component: FixedFileEditor,
})

function FixedFileEditor() {
  const initial = Route.useLoaderData()
  const params = Route.useParams()
  return (
    <ContentEntryEditor
      coordinates={{ ...params, path: initial.path }}
      initial={initial}
    />
  )
}
