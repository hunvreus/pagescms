import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import deployment from '#pagescms/deployment/client'
import { repositoryPageKey } from '#/lib/repository-page-path'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute, redirect, notFound } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { getSignInUrl } from '#/lib/auth-redirect'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { requireConfirmedProfile } from '#/features/account/require-profile'
import { RepositoryUnavailableError } from '#/features/repository/repository-unavailable-error'

export const Route = createFileRoute('/github/$owner/$repo/')({
  validateSearch: (search: Record<string, unknown>): { page?: string } => ({
    page: typeof search.page === 'string' ? search.page : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, location, deps }) => {
    try {
      await requireConfirmedProfile(context.queryClient, location.href)
      const repositoryData = await context.queryClient.ensureQueryData(
        repositoryQueryOptions({
          owner: params.owner,
          repo: params.repo,
        }),
      )
      if (
        deps.page &&
        !repositoryPageKey(deployment.repositoryPages, deps.page)
      )
        throw notFound()
      if (!(repositoryData.branch ?? repositoryData.repository.defaultBranch))
        return
      throw redirect({
        href: `/github/${encodeURIComponent(repositoryData.repository.owner)}/${encodeURIComponent(repositoryData.repository.repo)}/${encodeURIComponent(repositoryData.branch ?? repositoryData.repository.defaultBranch)}${deps.page ? `/${encodeURIComponent(deps.page)}` : ''}`,
      })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(`/github/${params.owner}/${params.repo}`),
        })
      }
      throw error
    }
  },
  pendingMs: 120,
  pendingComponent: RepositoryLoading,
  component: EmptyRepository,
  errorComponent: RepositoryUnavailableError,
  head: ({ params, matches }) =>
    pageTitle(
      translateMessage(matches[0].context.i18n, msg({ message: 'Repository' })),
      params,
    ),
})

function EmptyRepository() {
  const params = Route.useParams()
  useSuspenseQuery(
    repositoryQueryOptions({ owner: params.owner, repo: params.repo }),
  )
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyTitle>
            <UiTrans>Empty repository</UiTrans>
          </EmptyTitle>
          <EmptyDescription>
            <UiTrans>
              Create a branch and add a .pages.yml file to configure this
              repository.
            </UiTrans>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}

function RepositoryLoading() {
  const { t: _t } = useUiMessages()

  return (
    <main
      className="min-h-screen animate-pulse bg-muted/30"
      aria-label={_t({ message: 'Loading repository' })}
    />
  )
}
