import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { RepositoryActionsPage } from '#/features/admin/repository-actions-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { ActionsSkeleton } from '#/features/admin/actions-skeleton'

export const Route = createFileRoute('/github/$owner/$repo/$branch/actions')({
  validateSearch: (search: Record<string, unknown>): { action?: string } => ({
    action: typeof search.action === 'string' ? search.action : undefined,
  }),
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'actions')
  },
  pendingComponent: () => <ActionsSkeleton />,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: RepositoryActionsPage,
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
            msg({ message: 'Actions' }),
          ),
          params,
        ),
})
