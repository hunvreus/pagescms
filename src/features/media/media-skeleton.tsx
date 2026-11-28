import { useLingui as useUiMessages } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import EllipsisVertical from '@hugeicons/core-free-icons/EllipsisVerticalIcon'
import Folder from '@hugeicons/core-free-icons/Folder02Icon'

import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { RepositoryPageHeader } from '#/components/repository-page-header'

import type { MediaView } from './media-model'

export const mediaGridClassName =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),12rem))] justify-center gap-x-4 gap-y-6 sm:gap-x-6 md:gap-x-8 md:gap-y-8'

export function MediaPageSkeleton() {
  return (
    <div className="-m-4 flex min-h-svh flex-col md:-m-6">
      <RepositoryPageHeader
        toolbar={<Skeleton className="h-8 w-64" />}
        actions={
          <>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="size-8" />
            <Skeleton className="size-8 md:w-24" />
          </>
        }
      >
        <Skeleton className="h-5 w-40" />
      </RepositoryPageHeader>
      <section className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
        <Skeleton className="-mt-4 h-8 w-full md:hidden" />
        <MediaBrowserSkeleton />
      </section>
    </div>
  )
}

export function MediaBrowserSkeleton({ view = 'grid' }: { view?: MediaView }) {
  const { t: _t } = useUiMessages()

  return view === 'grid' ? (
    <div className={mediaGridClassName}>
      <div className="rounded-md p-2">
        <div className="flex aspect-video items-center justify-center text-muted">
          <HugeiconsIcon
            aria-hidden="true"
            icon={Folder}
            strokeWidth={2}
            className="size-[clamp(4.5rem,8vw,6rem)] animate-pulse [&>*]:[vector-effect:non-scaling-stroke]"
          />
        </div>
        <Skeleton className="mx-auto mt-2 h-4 w-3/4" />
      </div>
      {Array.from({ length: 9 }, (_, index) => (
        <div className="rounded-md" key={index}>
          <Skeleton className="aspect-video w-full rounded-md" />
          <div className="flex items-start gap-1 pt-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Button
              disabled
              aria-label={_t({ message: 'File actions' })}
              size="icon-sm"
              variant="ghost"
            >
              <HugeiconsIcon aria-hidden="true" icon={EllipsisVertical} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div
      className="overflow-hidden rounded-xl border"
      aria-label={_t({ message: 'Loading media' })}
      aria-busy="true"
    >
      <div className="flex gap-3 border-b px-3 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto hidden h-4 w-24 sm:block" />
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="flex items-center gap-3 border-b p-3 last:border-b-0"
          key={index}
        >
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <Skeleton className="h-4 w-40 max-w-[50%]" />
          <Skeleton className="ml-auto hidden h-4 w-24 sm:block" />
          <Skeleton className="size-7 shrink-0" />
        </div>
      ))}
    </div>
  )
}
