import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { Card, CardHeader, CardContent } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { ActivityFeedSkeleton } from '#/features/activity/activity-feed-skeleton'

export function OverviewSkeleton() {
  const { t: _t } = useUiMessages()

  return (
    <div
      className="-m-4 md:-m-6"
      aria-label={_t({ message: 'Loading overview' })}
      aria-busy="true"
    >
      <RepositoryPageHeader>
        <RepositoryPageTitle>
          <UiTrans>Overview</UiTrans>
        </RepositoryPageTitle>
      </RepositoryPageHeader>
      <div className="mx-auto max-w-3xl min-w-0 space-y-8 p-4 md:p-6">
        <Card>
          <CardHeader>
            <h2 className="text-base font-medium">
              <UiTrans>Quick links</UiTrans>
            </h2>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className={`h-7 ${i % 2 ? 'w-28' : 'w-40'}`} />
            ))}
          </CardContent>
        </Card>
        <section className="space-y-4">
          <h2 className="text-base font-medium">
            <UiTrans>Activity</UiTrans>
          </h2>
          <ActivityFeedSkeleton />
        </section>
        <section className="space-y-4">
          <h2 className="text-base font-medium">
            <UiTrans>Drafts</UiTrans>
          </h2>
          <OverviewFilesSkeleton draft />
        </section>
        <section className="space-y-4">
          <h2 className="text-base font-medium">
            <UiTrans>Recently visited</UiTrans>
          </h2>
          <OverviewFilesSkeleton />
        </section>
      </div>
    </div>
  )
}

export function OverviewFilesSkeleton({ draft = false }: { draft?: boolean }) {
  const { t: _t } = useUiMessages()

  return (
    <ul
      aria-label={
        draft
          ? _t({ message: 'Loading drafts' })
          : _t({ message: 'Loading recently visited entries' })
      }
      aria-busy="true"
      className="divide-y border-t"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          aria-hidden="true"
          className="flex h-11 items-center justify-between gap-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Skeleton
              className={`h-4 max-w-[50%] ${i % 2 ? 'w-24' : 'w-40'}`}
            />
            <Skeleton className="hidden h-5 w-24 shrink-0 rounded-full sm:block" />
          </div>
          <Skeleton className="h-4 w-14 shrink-0" />
        </li>
      ))}
    </ul>
  )
}
