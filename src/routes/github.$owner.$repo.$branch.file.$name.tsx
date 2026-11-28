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
import { fixedFileQueryOptions } from '#/client/queries/content'

export const Route = createFileRoute('/github/$owner/$repo/$branch/file/$name')(
  {
    validateSearch: (search: Record<string, unknown>): { locale?: string } => ({
      locale: typeof search.locale === 'string' ? search.locale : undefined,
    }),
    loaderDeps: ({ search }) => ({ locale: search.locale }),
    loader: async ({ context, params, deps }) => {
      requireRepositoryResource(context.queryClient, params, 'file')
      try {
        const data = await context.queryClient.ensureQueryData(
          fixedFileQueryOptions({
            ...params,
            ...context.repositoryIdentity,
            locale: deps.locale,
          }),
        )
        return { label: data.label }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Authentication required'
        ) {
          throw redirect({
            href: getSignInUrl(
              `/github/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/file/${encodeURIComponent(params.name)}`,
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
    component: FixedFileEditor,
    head: ({ params, loaderData, matches, match }) =>
      match.status === 'notFound' || match._notFound
        ? pageTitle(
            translateMessage(
              matches[0].context.i18n,
              msg({ message: 'Page not found' }),
            ),
            params,
          )
        : pageTitle(loaderData?.label ?? params.name, params),
  },
)

function FixedFileEditor() {
  const params = useRepositoryCoordinates(Route.useParams())
  const { data: initial } = useSuspenseQuery(
    fixedFileQueryOptions({ ...params, locale: Route.useSearch().locale }),
  )
  return (
    <ContentEntryEditor
      afterDeleteHref={`/github/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}`}
      coordinates={{ ...params, path: initial.path }}
      initial={initial}
      locale={Route.useSearch().locale}
    />
  )
}
