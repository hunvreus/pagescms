import { createFileRoute, redirect } from '@tanstack/react-router'

import { RepositoryWorkspace } from '#/components/repository-workspace'
import { getRepositoryWorkspace } from '#/functions/repository'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute('/$owner/$repo/$branch')({
  loader: async ({ params }) => {
    try {
      return await getRepositoryWorkspace({
        data: {
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
        },
      })
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
  staleTime: 15_000,
  gcTime: 10 * 60_000,
  pendingMs: 120,
  pendingComponent: WorkspaceLoading,
  component: BranchWorkspace,
})

function BranchWorkspace() {
  const workspace = Route.useLoaderData()
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
    />
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
