import { createFileRoute, getRouteApi } from '@tanstack/react-router'

const workspaceRoute = getRouteApi('/$owner/$repo/$branch')

export const Route = createFileRoute('/$owner/$repo/$branch/')({
  component: RepositoryOverview,
})

function RepositoryOverview() {
  const workspace = workspaceRoute.useLoaderData()

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <div className="max-w-md text-center">
        {workspace.configuration ? (
          <>
            <h2 className="text-xl font-semibold tracking-tight">
              Choose content to edit
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Select a collection, file, or media library from the repository
              navigation.
              {workspace.configuration.stale
                ? ' Cached configuration is visible while Pages CMS checks GitHub for changes.'
                : ''}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold tracking-tight">
              Repository not configured
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Add a .pages.yml file on this branch to start editing content.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
