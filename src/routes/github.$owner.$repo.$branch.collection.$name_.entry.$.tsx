import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import { requireRepositoryResource } from '#/features/repository/repository-route-resource'
import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { ContentEntryEditor } from '#/components/content-entry-editor'
import { ContentEntrySkeleton } from '#/components/content-entry-skeleton'
import { getSignInUrl } from '#/lib/auth-redirect'
import { entryQueryOptions } from '#/client/queries/content'

export const Route = createFileRoute(
  '/github/$owner/$repo/$branch/collection/$name_/entry/$',
)({
  validateSearch: (search: Record<string, unknown>): { locale?: string } => ({
    locale: typeof search.locale === 'string' ? search.locale : undefined,
  }),
  loader: async ({ context, params }) => {
    requireRepositoryResource(context.queryClient, params, 'collection')
    const path = params._splat
    if (!path) throw new Error('Entry path is required')
    try {
      const data = await context.queryClient.ensureQueryData(
        entryQueryOptions({ ...params, ...context.repositoryIdentity, path }),
      )
      return { label: data.label }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/github/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry/${path}`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingMinMs: 0,
  pendingComponent: ContentEntrySkeleton,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: CollectionEntryEditor,
  head: ({ params, loaderData, matches, match }) =>
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
              message: `Edit ${params._splat ?? 'entry'} | ${loaderData?.label ?? params.name}`,
            }),
          ),
          params,
        ),
})

function CollectionEntryEditor() {
  const params = useRepositoryCoordinates(Route.useParams())
  const path = params._splat!
  const { data: initial } = useSuspenseQuery(
    entryQueryOptions({ ...params, path }),
  )
  const locale = Route.useSearch().locale ?? initial.locale ?? undefined
  return (
    <ContentEntryEditor
      afterDeleteHref={`/github/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}${locale ? '?locale=' + encodeURIComponent(locale) : ''}`}
      coordinates={{ ...params, path }}
      initial={initial}
      locale={locale}
      renameBaseHref={`/github/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry`}
    />
  )
}
