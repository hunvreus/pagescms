import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from '#/lib/utils'

import type { ReactNode } from 'react'

export function RepositoryAdminPage({
  title,
  actions,
  children,
  className,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader actions={actions}>
        <RepositoryPageTitle>{title}</RepositoryPageTitle>
      </RepositoryPageHeader>
      <div className={cn('mx-auto max-w-5xl space-y-6 p-4 md:p-6', className)}>
        {children}
      </div>
    </div>
  )
}

export function RepositoryAdminPageSkeleton({ label }: { label: string }) {
  return (
    <div className="-m-4 md:-m-6" aria-label={label}>
      <RepositoryPageHeader actions={<Skeleton className="h-8 w-24" />}>
        <Skeleton className="h-5 w-32" />
      </RepositoryPageHeader>
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    </div>
  )
}
