import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import { requireRepositoryResource } from '#/features/repository/repository-route-resource'
import {
  RepositoryNotFound,
  RepositoryAccessDenied,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { pageTitle } from '#/lib/page-title'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { CollectionEntryCreator } from '#/components/collection-entry-creator'
import { ContentEntrySkeleton } from '#/components/content-entry-skeleton'
import { getSignInUrl } from '#/lib/auth-redirect'
import { CollectionAccessDenied } from '#/client/api/collections'
import { collectionQueryOptions } from '#/client/queries/content'

export interface NewEntrySearch {
  draft?: string
  locale?: string
  parent?: string
}

export const Route = createFileRoute(
  '/github/$owner/$repo/$branch/collection/$name_/new',
)({
  validateSearch: (search: Record<string, unknown>): NewEntrySearch => ({
    locale: typeof search.locale === 'string' ? search.locale : undefined,
    draft: typeof search.draft === 'string' ? search.draft : undefined,
    parent:
      typeof search.parent === 'string' && search.parent
        ? search.parent
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    parent: search.parent,
    locale: search.locale,
  }),
  loader: async ({ context, params, deps }) => {
    requireRepositoryResource(context.queryClient, params, 'collection')
    try {
      const data = await context.queryClient.ensureQueryData(
        collectionQueryOptions({
          ...params,
          ...context.repositoryIdentity,
          path: deps.parent,
          locale: deps.locale,
        }),
      )
      return { label: data.collection.label }
    } catch (error) {
      if (error instanceof CollectionAccessDenied)
        return { denied: true as const }
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/github/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/new`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: ContentEntrySkeleton,
  pendingMinMs: 0,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: NewCollectionRoute,
  head: ({ params, loaderData, match, matches }) =>
    match.status === 'notFound' || match._notFound
      ? pageTitle(
          translateMessage(
            matches[0].context.i18n,
            msg({ message: 'Page not found' }),
          ),
          params,
        )
      : pageTitle(
          translateMessage(
            matches[0].context.i18n,
            msg({
              message: `New entry | ${loaderData?.label ?? params.name}${match.loaderDeps.parent ? ` / ${match.loaderDeps.parent}` : ''}`,
            }),
          ),
          params,
        ),
})

function NewCollectionRoute() {
  return Route.useLoaderData().denied ? (
    <RepositoryAccessDenied />
  ) : (
    <NewCollectionEntry />
  )
}

function NewCollectionEntry() {
  const params = useRepositoryCoordinates(Route.useParams())
  const search = Route.useSearch()
  const { data } = useSuspenseQuery(
    collectionQueryOptions({
      ...params,
      path: search.parent,
      locale: search.locale,
    }),
  )

  if (!data.collection.operations.create) return <RepositoryAccessDenied />

  return (
    <CollectionEntryCreator
      key={`${params.owner}:${params.repo}:${params.branch}:${params.name}:${search.parent ?? ''}:${search.locale ?? ''}:${search.draft ?? 'new'}`}
      coordinates={params}
      initial={data}
      parent={search.parent}
    />
  )
}
