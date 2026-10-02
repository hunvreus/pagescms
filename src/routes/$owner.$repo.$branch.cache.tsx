import { createFileRoute, redirect } from '@tanstack/react-router'

import { CachePage } from '#/features/admin/cache-page'
import { RepositoryAdminPageSkeleton } from '#/features/admin/repository-admin-page'
import { getSignInUrl } from '#/lib/auth-redirect'
import { cacheStatusQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/cache')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(cacheStatusQueryOptions(params))
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/cache`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: () => (
    <RepositoryAdminPageSkeleton label="Loading cache status" />
  ),
  component: () => <CachePage {...Route.useParams()} />,
})
