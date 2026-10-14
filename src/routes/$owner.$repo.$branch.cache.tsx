import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { CachePage } from '#/features/admin/cache-page'
import { ensureRepositoryAdmin } from '#/features/admin/repository-admin-access'
import { CacheSkeleton } from '#/features/admin/cache-skeleton'
import { cacheStatusQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/cache')({
  loader: async ({ context, params }) => {
    await ensureRepositoryAdmin(context.queryClient, params, 'cache')
    await context.queryClient.ensureQueryData(cacheStatusQueryOptions(params))
  },
  pendingComponent: () => <CacheSkeleton />,
  component: () => <CachePage {...Route.useParams()} />,
  head: ({ params }) => pageTitle('Cache', params),
})
