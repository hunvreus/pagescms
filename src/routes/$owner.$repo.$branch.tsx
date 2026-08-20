import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { RepositoryWorkspace } from '#/components/repository-workspace'
import { getSignInUrl } from '#/lib/auth-redirect'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        repositoryWorkspaceQueryOptions({
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
        }),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 120,
  pendingComponent: WorkspaceLoading,
  component: BranchWorkspace,
})

function BranchWorkspace() {
  const params = Route.useParams()
  const { data: workspace } = useSuspenseQuery(
    repositoryWorkspaceQueryOptions(params),
  )
  if (!workspace.branchExists) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Branch not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This branch may have been removed or renamed.
          </p>
        </div>
      </main>
    )
  }
  return (
    <RepositoryWorkspace
      owner={workspace.repository.owner}
      repo={workspace.repository.repo}
      branch={workspace.branch!}
      branches={workspace.branches}
      configuration={workspace.configuration}
    >
      <Outlet />
    </RepositoryWorkspace>
  )
}

function WorkspaceLoading() {
  return (
    <div
      className="min-h-screen animate-pulse bg-muted/20 md:grid md:grid-cols-[16rem_1fr]"
      aria-label="Loading repository"
    >
      <div className="border-r bg-background" />
      <div />
    </div>
  )
}
