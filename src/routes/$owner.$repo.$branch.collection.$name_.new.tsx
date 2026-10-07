import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { CollectionEntryCreator } from '#/components/collection-entry-creator'
import { ContentEntrySkeleton } from '#/components/content-entry-skeleton'
import { getSignInUrl } from '#/lib/auth-redirect'
import { collectionQueryOptions } from '#/queries/content'

interface NewEntrySearch {
  parent?: string
}

export const Route = createFileRoute(
  '/$owner/$repo/$branch/collection/$name_/new',
)({
  validateSearch: (search: Record<string, unknown>): NewEntrySearch => ({
    parent:
      typeof search.parent === 'string' && search.parent
        ? search.parent
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ parent: search.parent }),
  loader: async ({ context, params, deps }) => {
    try {
      await context.queryClient.ensureQueryData(
        collectionQueryOptions({ ...params, path: deps.parent }),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/new`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: ContentEntrySkeleton,
  component: NewCollectionEntry,
})

function NewCollectionEntry() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const { data } = useSuspenseQuery(
    collectionQueryOptions({ ...params, path: search.parent }),
  )

  return (
    <CollectionEntryCreator
      coordinates={params}
      initial={data}
      parent={search.parent}
    />
  )
}
