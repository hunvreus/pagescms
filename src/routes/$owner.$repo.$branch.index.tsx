import {
  createFileRoute,
  getRouteApi,
  Link,
  redirect,
} from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Button } from '#/components/ui/button'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { getDefaultConfigurationNavigationItem } from '#/lib/configuration-navigation'

const workspaceRoute = getRouteApi('/$owner/$repo/$branch')

export const Route = createFileRoute('/$owner/$repo/$branch/')({
  loader: async ({ context, params }) => {
    const workspace = await context.queryClient.ensureQueryData(
      repositoryWorkspaceQueryOptions(params),
    )
    const item = workspace.configuration
      ? getDefaultConfigurationNavigationItem(workspace.configuration.object)
      : null
    if (!item) return
    const targetParams = { ...params, name: item.name }
    throw redirect({
      to:
        item.type === 'collection'
          ? '/$owner/$repo/$branch/collection/$name'
          : item.type === 'file'
            ? '/$owner/$repo/$branch/file/$name'
            : '/$owner/$repo/$branch/media/$name',
      params: targetParams,
      replace: true,
    })
  },
  component: RepositoryOverview,
})

function RepositoryOverview() {
  const params = workspaceRoute.useParams()
  const { data: workspace, isFetching } = useSuspenseQuery(
    repositoryWorkspaceQueryOptions(params),
  )

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <Empty className="max-w-md">
        <EmptyHeader>
          {workspace.configuration ? (
            <>
              <EmptyTitle>Choose content to edit</EmptyTitle>
              <EmptyDescription>
                Select a collection, file, or media library from the repository
                navigation.
                {isFetching
                  ? ' Cached data is visible while Pages CMS checks for updates.'
                  : ''}
              </EmptyDescription>
            </>
          ) : (
            <>
              <EmptyTitle>Repository not configured</EmptyTitle>
              <EmptyDescription>
                Add a .pages.yml file on this branch to start editing content.
              </EmptyDescription>
            </>
          )}
        </EmptyHeader>
        {!workspace.configuration && workspace.canViewGitHub ? (
          <EmptyContent>
            <Button asChild>
              <Link
                to="/$owner/$repo/$branch/settings"
                params={params}
                search={{ edit: 'configuration' }}
              >
                Add configuration
              </Link>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  )
}
