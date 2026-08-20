import { createFileRoute, redirect } from '@tanstack/react-router'

import { getRepositoryWorkspace } from '#/functions/repository'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute('/$owner/$repo/')({
  loader: async ({ params }) => {
    try {
      const workspace = await getRepositoryWorkspace({
        data: { owner: params.owner, repo: params.repo },
      })
      if (!workspace.repository.defaultBranch) return workspace
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
  staleTime: 15_000,
  pendingMs: 120,
  pendingComponent: RepositoryLoading,
  component: EmptyRepository,
})

function EmptyRepository() {
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
