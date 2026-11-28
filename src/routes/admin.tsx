import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import { AdminPage } from '#/features/admin/admin-page'
import { pageTitle } from '#/lib/page-title'
import {
  createFileRoute,
  redirect,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { adminDashboardQueryOptions } from '#/client/queries/admin'
import { requireConfirmedProfile } from '#/features/account/require-profile'

export interface AdminSearch {
  query?: string
  page?: number
  repoQuery?: string
  repoPage?: number
}

export const Route = createFileRoute('/admin')({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    repoQuery:
      typeof search.repoQuery === 'string' && search.repoQuery
        ? search.repoQuery
        : undefined,
    repoPage:
      typeof search.repoPage === 'number' &&
      Number.isInteger(search.repoPage) &&
      search.repoPage > 1
        ? search.repoPage
        : undefined,
    query:
      typeof search.query === 'string' && search.query
        ? search.query
        : undefined,
    page:
      typeof search.page === 'number' &&
      Number.isInteger(search.page) &&
      search.page > 1
        ? search.page
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    query: search.query ?? '',
    page: search.page ?? 1,
    repoQuery: search.repoQuery ?? '',
    repoPage: search.repoPage ?? 1,
  }),
  loader: async ({ context, deps, location }) => {
    try {
      await requireConfirmedProfile(context.queryClient, location.href)
      await context.queryClient.ensureQueryData(
        adminDashboardQueryOptions(deps),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: `/sign-in?redirect=${encodeURIComponent(location.href)}`,
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: lazyRouteComponent(
    () => import('#/features/admin/admin-page'),
    'AdminSkeleton',
  ),
  component: AdminPage,
  head: ({ matches }) =>
    pageTitle(
      translateMessage(matches[0].context.i18n, msg({ message: 'Admin' })),
    ),
})
