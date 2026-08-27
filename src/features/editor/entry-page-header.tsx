import { Fragment } from 'react'

import { RepositoryPageHeader } from '#/components/repository-page-header'

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

import type { EntryBreadcrumbSegment } from './entry-breadcrumb'
import type { ReactNode } from 'react'

export function EntryPageHeader({
  actions,
  collectionHref,
  segments,
}: {
  actions: ReactNode
  collectionHref?: string
  segments: readonly EntryBreadcrumbSegment[]
}) {
  return (
    <RepositoryPageHeader
      actions={<div className="flex items-center gap-2">{actions}</div>}
    >
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap text-lg font-medium">
          {segments.map((segment, index) => (
            <Fragment key={`${segment.type}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              {segment.type === 'group' ? (
                <BreadcrumbItem className="hidden shrink-0 sm:inline-flex">
                  <span>{segment.label}</span>
                </BreadcrumbItem>
              ) : segment.type === 'root' ? (
                <BreadcrumbItem className="shrink-0">
                  {collectionHref ? (
                    <BreadcrumbLink href={collectionHref}>
                      {segment.label}
                    </BreadcrumbLink>
                  ) : (
                    <span>{segment.label}</span>
                  )}
                </BreadcrumbItem>
              ) : segment.type === 'ellipsis' ? (
                <BreadcrumbItem className="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <BreadcrumbEllipsis className="size-6" />
                      <span className="sr-only">Show parent folders</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {segment.items.map((item) => (
                        <DropdownMenuItem asChild key={item.path}>
                          <a href={folderHref(collectionHref, item.path)}>
                            {item.label}
                          </a>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
              ) : segment.type === 'folder' ? (
                <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
                  <BreadcrumbLink
                    className="max-w-40 truncate"
                    href={folderHref(collectionHref, segment.path)}
                  >
                    {segment.label}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              ) : (
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate font-medium">
                    {segment.label}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              )}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </RepositoryPageHeader>
  )
}

function folderHref(collectionHref: string | undefined, path: string) {
  if (!collectionHref) return '#'
  const search = new URLSearchParams({ path })
  return `${collectionHref}?${search}`
}
