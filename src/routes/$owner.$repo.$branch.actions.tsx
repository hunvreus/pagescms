import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { RepositoryActionsPage } from '#/features/admin/repository-actions-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { ActionsSkeleton } from '#/features/admin/actions-skeleton'

export const Route = createFileRoute('/$owner/$repo/$branch/actions')({
  validateSearch: (search: Record<string, unknown>): { action?: string } => ({
    action: typeof search.action === 'string' ? search.action : undefined,
  }),
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'actions')
  },
  pendingComponent: () => <ActionsSkeleton />,
  component: RepositoryActionsPage,
  head: ({ params }) => pageTitle('Actions', params),
})
