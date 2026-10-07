import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { RepositoryAdminPage } from './repository-admin-page'

export function ConfigurationSkeleton() {
  return (
    <RepositoryAdminPage
      embedded
      title="Configuration"
      actions={
        <Button size="sm" variant="outline" disabled>
          Edit configuration
        </Button>
      }
    >
      <Skeleton
        aria-label="Loading configuration"
        aria-busy="true"
        className="h-40 w-full rounded-xl"
      />
    </RepositoryAdminPage>
  )
}
