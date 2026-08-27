import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { getSignInUrl } from '#/lib/auth-redirect'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/')({
  loader: async ({ context, params }) => {
    try {
      const workspace = await context.queryClient.ensureQueryData(
        repositoryWorkspaceQueryOptions({
          owner: params.owner,
          repo: params.repo,
        }),
      )
      if (!workspace.repository.defaultBranch) return
      throw redirect({
        href: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(workspace.repository.defaultBranch)}`,
      })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(`/${params.owner}/${params.repo}`),
        })
      }
      throw error
    }
  },
  pendingMs: 120,
  pendingComponent: RepositoryLoading,
  component: EmptyRepository,
})

function EmptyRepository() {
  const params = Route.useParams()
  useSuspenseQuery(
    repositoryWorkspaceQueryOptions({ owner: params.owner, repo: params.repo }),
  )
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyTitle>Empty repository</EmptyTitle>
          <EmptyDescription>
            Create a branch and add a .pages.yml file to configure this
            repository.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}

function RepositoryLoading() {
  return (
    <main
      className="min-h-screen animate-pulse bg-muted/30"
      aria-label="Loading repository"
    />
  )
}
