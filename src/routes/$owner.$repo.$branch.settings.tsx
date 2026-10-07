import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/features/admin/settings-page'
import { RepositoryAdminPageSkeleton } from '#/features/admin/repository-admin-page'

export const Route = createFileRoute('/$owner/$repo/$branch/settings')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { edit?: 'configuration'; dialog?: 'runs'; action?: string } => ({
    edit: search.edit === 'configuration' ? 'configuration' : undefined,
    dialog: search.dialog === 'runs' ? 'runs' : undefined,
    action: typeof search.action === 'string' ? search.action : undefined,
  }),
  pendingComponent: () => (
    <RepositoryAdminPageSkeleton label="Loading settings" />
  ),
  component: SettingsPage,
})
