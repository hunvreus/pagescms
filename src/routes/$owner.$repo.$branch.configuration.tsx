import { createFileRoute, redirect } from '@tanstack/react-router'

import { ConfigurationPage } from '#/features/admin/configuration-page'
import { RepositoryAdminPageSkeleton } from '#/features/admin/repository-admin-page'
import { getSignInUrl } from '#/lib/auth-redirect'
import { configurationEditorQueryOptions } from '#/queries/content'

export const Route = createFileRoute('/$owner/$repo/$branch/configuration')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        configurationEditorQueryOptions(params),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/configuration`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: () => (
    <RepositoryAdminPageSkeleton label="Loading configuration" />
  ),
  component: () => <ConfigurationPage {...Route.useParams()} />,
})
