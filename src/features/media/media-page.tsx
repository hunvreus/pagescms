import { FolderPlus, Grid2X2, List, Search, Upload } from 'lucide-react'

import { RepositoryPageHeader } from '#/components/repository-page-header'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'

import { MediaBrowser, MediaBrowserSkeleton } from './media-browser'

import type { MediaCoordinates } from './media-browser'

export function MediaPage({
  coordinates,
  path,
  onPathChange,
}: {
  coordinates: MediaCoordinates
  path?: string
  onPathChange: (path: string) => void
}) {
  return (
    <div className="-m-4 md:-m-6">
      <MediaBrowser
        coordinates={coordinates}
        path={path}
        variant="page"
        onPathChange={onPathChange}
      />
    </div>
  )
}

export function MediaPageSkeleton() {
  return (
    <div className="-m-4 md:-m-6" aria-label="Loading media">
      <RepositoryPageHeader
        actions={
          <>
            <div className="relative hidden w-64 sm:block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input disabled className="pl-8" placeholder="Search media…" />
            </div>
            <ButtonGroup aria-label="Media view">
              <Button
                disabled
                aria-label="Grid view"
                size="icon"
                variant="secondary"
              >
                <Grid2X2 />
              </Button>
              <Button
                disabled
                aria-label="List view"
                size="icon"
                variant="outline"
              >
                <List />
              </Button>
            </ButtonGroup>
            <Button
              disabled
              aria-label="New folder"
              size="icon"
              variant="outline"
            >
              <FolderPlus />
            </Button>
            <Button disabled>
              <Upload /> Upload
            </Button>
          </>
        }
      >
        <Skeleton className="h-5 w-40" />
      </RepositoryPageHeader>
      <div className="p-4 md:p-6">
        <MediaBrowserSkeleton />
      </div>
    </div>
  )
}
