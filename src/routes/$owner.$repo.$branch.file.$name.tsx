import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import {
  ContentEntryEditor,
  ContentEntrySkeleton,
} from '#/components/content-entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'
import { fixedFileQueryOptions } from '#/queries/content'

export const Route = createFileRoute('/$owner/$repo/$branch/file/$name')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(fixedFileQueryOptions(params))
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
  pendingMs: 100,
  pendingComponent: ContentEntrySkeleton,
  component: FixedFileEditor,
})

function FixedFileEditor() {
  const params = Route.useParams()
  const { data: initial } = useSuspenseQuery(fixedFileQueryOptions(params))
  return (
    <ContentEntryEditor
      afterDeleteHref={`/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}`}
      coordinates={{ ...params, path: initial.path }}
      initial={initial}
    />
  )
}
