import { Link } from '@tanstack/react-router'
import { RepositoryPageHeader } from '#/components/repository-page-header'
import { RepositoryBreadcrumb } from '#/components/repository-breadcrumb'
import type { EntryBreadcrumbSegment } from './entry-breadcrumb'
import type { ReactNode } from 'react'

export function EntryPageHeader({
  actions,
  locale,
  collectionHref,
  segments,
  status,
}: {
  actions: ReactNode
  locale?: string
  collectionHref?: string
  segments: readonly EntryBreadcrumbSegment[]
  status?: ReactNode
}) {
  return (
    <RepositoryPageHeader
      actions={
        <div className="flex items-center gap-1 md:gap-2">
          {status}
          {actions}
        </div>
      }
    >
      <div className="flex min-w-0 items-center gap-1 md:gap-2">
        <RepositoryBreadcrumb
          items={segments.map((segment) => ({
            label: segment.label,
            link:
              collectionHref &&
              (segment.type === 'root' || segment.type === 'folder') ? (
                <Link
                  to={collectionHref}
                  search={{
                    path: segment.type === 'folder' ? segment.path : undefined,
                    locale,
                  }}
                >
                  {segment.label}
                </Link>
              ) : undefined,
          }))}
        />
      </div>
    </RepositoryPageHeader>
  )
}
