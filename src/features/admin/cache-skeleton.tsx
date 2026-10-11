import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { RepositoryAdminPage } from './repository-admin-page'

export function CacheSkeleton() {
  return (
    <RepositoryAdminPage
      title="Cache"
      actions={
        <Button disabled variant="destructive">
          Clear all
        </Button>
      }
    >
      <div
        aria-label="Loading cache"
        aria-busy="true"
        className="divide-y rounded-xl border bg-card"
      >
        {['Content', 'Configuration'].map((title) => (
          <div key={title}>
            <div className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{title}</h3>
                  <Skeleton className="h-5 w-28 rounded-full" />
                </div>
                <Skeleton className="mt-0.5 h-4 w-full max-w-lg" />
              </div>
              <div className="flex shrink-0 gap-2">
                <Button disabled size="sm" variant="ghost">
                  Refresh
                </Button>
                <Button disabled size="sm" variant="destructive">
                  Clear
                </Button>
              </div>
            </div>
            {title === 'Content' ? (
              <Skeleton className="mx-4 mb-4 h-5 w-24" />
            ) : null}
          </div>
        ))}
      </div>
    </RepositoryAdminPage>
  )
}
