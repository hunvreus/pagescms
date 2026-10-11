import { createFileRoute } from '@tanstack/react-router'
import { CollaboratorsPage } from '#/features/admin/collaborators-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { CollaboratorsSkeleton } from '#/features/admin/collaborators-skeleton'
import { collaboratorsQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/collaborators')({
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'collaborators')
    await context.queryClient.ensureQueryData(collaboratorsQueryOptions(params))
  },
  pendingComponent: CollaboratorsSkeleton,
  component: () => <CollaboratorsPage {...Route.useParams()} />,
})
