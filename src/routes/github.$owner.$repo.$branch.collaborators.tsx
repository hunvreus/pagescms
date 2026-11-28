import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import {
  RepositoryNotFound,
  RepositoryError,
} from '#/features/repository/repository-route-state'
import {
  hasRepositoryCollaborators,
  preloadRepositoryCollaborators,
} from '#/features/collaborators/collaborators-contribution'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { CollaboratorsPage } from '#/features/admin/collaborators-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { CollaboratorsSkeleton } from '#/features/admin/collaborators-skeleton'
import { collaboratorsQueryOptions } from '#/client/queries/repository'

export const Route = createFileRoute(
  '/github/$owner/$repo/$branch/collaborators',
)({
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'collaborators')
    if (hasRepositoryCollaborators) {
      await preloadRepositoryCollaborators(
        { ...params, ...context.repositoryIdentity },
        context.queryClient,
      )
      return
    }
    await context.queryClient.ensureQueryData(
      collaboratorsQueryOptions({ ...params, ...context.repositoryIdentity }),
    )
  },
  pendingComponent: CollaboratorsSkeleton,
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryError,
  component: () => (
    <CollaboratorsPage {...useRepositoryCoordinates(Route.useParams())} />
  ),
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
            msg({ message: 'Collaborators' }),
          ),
          params,
        ),
})
