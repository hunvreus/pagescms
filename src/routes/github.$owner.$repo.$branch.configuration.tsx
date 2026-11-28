import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { RepositoryConfigurationPage } from '#/features/admin/repository-configuration-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { ConfigurationSkeleton } from '#/features/admin/configuration-skeleton'
import { loadCodeEditor } from '#/features/editor/editor-component-loaders'
import { configurationEditorQueryOptions } from '#/client/queries/content'

export const Route = createFileRoute(
  '/github/$owner/$repo/$branch/configuration',
)({
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'configuration')
    void loadCodeEditor().catch(() => {})
    await context.queryClient.ensureQueryData(
      configurationEditorQueryOptions({
        ...params,
        ...context.repositoryIdentity,
      }),
    )
  },
  pendingComponent: ConfigurationSkeleton,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: RepositoryConfigurationPage,
  head: ({ params, matches, match }) =>
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
            msg({ message: 'Configuration' }),
          ),
          params,
        ),
})
