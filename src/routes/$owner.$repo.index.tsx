import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

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
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Empty repository</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a branch and add a .pages.yml file to configure this
          repository.
        </p>
      </div>
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
