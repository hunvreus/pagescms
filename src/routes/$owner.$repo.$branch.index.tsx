import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { RepositoryDashboard } from '#/features/drafts/repository-dashboard'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      repositoryWorkspaceQueryOptions(params),
    ),
  component: RepositoryHome,
  head: ({ params }) => pageTitle('Overview', params),
})

function RepositoryHome() {
  return <RepositoryDashboard coordinates={Route.useParams()} />
}
