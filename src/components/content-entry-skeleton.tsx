import { RepositoryPageHeader } from '#/components/repository-page-header'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import { Field, FieldGroup } from '#/components/ui/field'
import { Skeleton } from '#/components/ui/skeleton'

export function ContentEntryFieldsSkeleton() {
  return (
    <FieldGroup role="status" aria-label="Loading editor fields">
      <Field>
        <div data-slot="field-header" className="flex min-h-6 items-center">
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-full rounded-lg" />
      </Field>
      <Field>
        <div
          data-slot="field-header"
          className="flex min-h-6 items-center justify-between gap-2"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </Field>
    </FieldGroup>
  )
}

export function ContentEntrySkeleton() {
  return (
    <div className="-m-4 md:-m-6" aria-label="Loading entry">
      <RepositoryPageHeader
        actions={
          <>
            <Button disabled>Save</Button>
            <ButtonGroup aria-label="History and entry actions">
              <Button
                aria-label="Entry history"
                disabled
                size="icon"
                variant="outline"
              />
              <Button
                aria-label="Entry actions"
                disabled
                size="icon"
                variant="outline"
              />
            </ButtonGroup>
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
        <ContentEntryFieldsSkeleton />
      </div>
    </div>
  )
}
