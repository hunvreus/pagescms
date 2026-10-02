import { createFileRoute, redirect } from '@tanstack/react-router'

import { CollaboratorsPage } from '#/features/admin/collaborators-page'
import { RepositoryAdminPageSkeleton } from '#/features/admin/repository-admin-page'
import { getSignInUrl } from '#/lib/auth-redirect'
import { collaboratorsQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/collaborators')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        collaboratorsQueryOptions(params),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collaborators`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: () => (
    <RepositoryAdminPageSkeleton label="Loading collaborators" />
  ),
  component: () => <CollaboratorsPage {...Route.useParams()} />,
})
