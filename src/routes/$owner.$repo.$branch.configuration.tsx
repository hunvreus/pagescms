import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { RepositoryConfigurationPage } from '#/features/admin/repository-configuration-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { ConfigurationSkeleton } from '#/features/admin/configuration-skeleton'
import { configurationEditorQueryOptions } from '#/queries/content'

export const Route = createFileRoute('/$owner/$repo/$branch/configuration')({
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'configuration')
    await context.queryClient.ensureQueryData(
      configurationEditorQueryOptions(params),
    )
  },
  pendingComponent: ConfigurationSkeleton,
  component: RepositoryConfigurationPage,
  head: ({ params }) => pageTitle('Configuration', params),
})
