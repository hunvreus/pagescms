import { RepositoryPageHeader } from '#/components/repository-page-header'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Button } from '#/components/ui/button'
import { FieldGroup } from '#/components/ui/field'
import { Skeleton } from '#/components/ui/skeleton'

export function ContentEntrySkeleton() {
  return (
    <div className="-m-4 md:-m-6" aria-label="Loading entry">
      <RepositoryPageHeader
        actions={
          <>
            <Button
              aria-label="Entry history"
              disabled
              size="icon"
              variant="outline"
            />
            <Button disabled>Save</Button>
            <Button
              aria-label="Entry actions"
              disabled
              size="icon"
              variant="outline"
            />
          </>
        }
      >
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap text-lg font-medium">
            <BreadcrumbItem className="shrink-0">
              <Skeleton className="h-5 w-20" />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <Skeleton className="h-5 w-44" />
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </RepositoryPageHeader>
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <FieldGroup>
          {[0, 1, 2, 3].map((index) => (
            <div className="space-y-2" key={index}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-72 w-full" />
          </div>
        </FieldGroup>
      </div>
    </div>
  )
}
