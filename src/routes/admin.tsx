import { createFileRoute, redirect } from '@tanstack/react-router'
import { adminDashboardQueryOptions } from '#/queries/admin'
import { AdminPage, AdminSkeleton } from '#/features/admin/admin-page'

interface AdminSearch {
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
  loader: async ({ context, deps }) => {
    try {
      await context.queryClient.ensureQueryData(
        adminDashboardQueryOptions(deps),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({ href: '/sign-in?redirect=%2Fadmin' })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: AdminSkeleton,
  component: AdminPage,
})
