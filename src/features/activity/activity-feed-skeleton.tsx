import { useLingui as useUiMessages } from '@lingui/react/macro'
import { Skeleton } from '#/components/ui/skeleton'

export function ActivityFeedSkeleton() {
  const { t: _t } = useUiMessages()

  return (
    <div aria-label={_t({ message: 'Loading activity' })} aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="group/activity relative flex items-start gap-3 pb-5 last:pb-0"
        >
          <span className="absolute top-6 bottom-0 left-3 w-px -translate-x-1/2 bg-border group-last/activity:hidden" />
          <Skeleton className="relative size-6 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-44 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-4 w-14 shrink-0" />
        </div>
      ))}
    </div>
  )
}
