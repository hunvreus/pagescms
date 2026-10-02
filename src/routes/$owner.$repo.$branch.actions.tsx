import { createFileRoute, redirect } from '@tanstack/react-router'

import { ActionsPage } from '#/features/admin/actions-page'
import { RepositoryAdminPageSkeleton } from '#/features/admin/repository-admin-page'
import { getSignInUrl } from '#/lib/auth-redirect'
import { actionsQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/actions')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(actionsQueryOptions(params))
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/actions`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: () => (
    <RepositoryAdminPageSkeleton label="Loading actions" />
  ),
  component: () => <ActionsPage {...Route.useParams()} />,
})
