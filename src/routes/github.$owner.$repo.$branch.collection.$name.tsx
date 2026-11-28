import { isContentLocaleCode } from '#/lib/i18n'
import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import { requireRepositoryResource } from '#/features/repository/repository-route-resource'
import {
  RepositoryNotFound,
  RepositoryAccessDenied,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { CollectionPage } from '#/features/collections/collection-page'
import { CollectionSkeleton } from '#/features/collections/collection-skeleton'
import { getSignInUrl } from '#/lib/auth-redirect'
import { pageTitle } from '#/lib/page-title'
import { CollectionAccessDenied } from '#/client/api/collections'
import { collectionQueryOptions } from '#/client/queries/content'

export interface CollectionSearch {
  path?: string
  locale?: string
}

export const Route = createFileRoute(
  '/github/$owner/$repo/$branch/collection/$name',
)({
  validateSearch: (search: Record<string, unknown>): CollectionSearch => ({
    locale: typeof search.locale === 'string' ? search.locale : undefined,
    path:
      typeof search.path === 'string' && search.path ? search.path : undefined,
  }),
  beforeLoad: ({ search }) => ({
    collectionLocale: isContentLocaleCode(search.locale)
      ? search.locale
      : undefined,
  }),
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: async ({ context, params, deps }) => {
    requireRepositoryResource(context.queryClient, params, 'collection')
    try {
      const data = await context.queryClient.ensureQueryData(
        collectionQueryOptions({
          ...context.repositoryIdentity,
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          name: params.name,
          path: deps.path,
          locale: context.collectionLocale,
        }),
      )
      return { label: data.collection.label, data }
    } catch (error) {
      if (error instanceof CollectionAccessDenied)
        return { denied: true as const }
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/github/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingMinMs: 0,
  pendingComponent: CollectionSkeleton,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: CollectionRoute,
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
          `${loaderData?.label ?? params.name}${match.loaderDeps.path ? ` / ${match.loaderDeps.path}` : ''}`,
          params,
        ),
})

function CollectionRoute() {
  const data = Route.useLoaderData()
  return data.denied ? (
    <RepositoryAccessDenied />
  ) : (
    <CollectionPage data={data.data} />
  )
}
