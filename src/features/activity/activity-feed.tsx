import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import { LoadError } from '#/components/operation-error'
import { getActivity } from '#/client/api/activity'
import { queryKeys } from '#/client/queries/keys'
import type { ConfigurationNavigationItem } from '#/shared/configuration-navigation'
import { ActivityFeedItem } from './activity-feed-item'
import { ActivityFeedSkeleton } from './activity-feed-skeleton'

export function ActivityFeed({
  account,
  coordinates,
  resources,
  hideWhenEmpty,
}: {
  account: string | undefined
  coordinates: { owner: string; repo: string; branch: string }
  resources: readonly ConfigurationNavigationItem[]
  hideWhenEmpty: boolean
}) {
  const { t: _t } = useUiMessages()

  const [count, setCount] = useState(5)
  const query = useInfiniteQuery({
    queryKey: [
      ...queryKeys.branch(coordinates),
      'activity',
      account,
      'infinite',
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getActivity({ ...coordinates, page: pageParam }),
    getNextPageParam: (page, pages) =>
      page.hasNext ? pages.length : undefined,
    enabled: Boolean(account),
    staleTime: 15_000,
    refetchOnMount: 'always',
  })
  const events = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ]
  if (hideWhenEmpty && !query.isPending && !events.length && !query.error)
    return null
  const base = `/github/${[coordinates.owner, coordinates.repo, coordinates.branch].map(encodeURIComponent).join('/')}`
  async function showMore() {
    if (count + 5 > events.length && query.hasNextPage) {
      const result = await query.fetchNextPage()
      if (result.isFetchNextPageError) return
    }
    setCount((value) => value + 5)
  }
  return (
    <section aria-label={_t({ message: 'Activity' })} className="space-y-4">
      <h2 className="text-base font-medium">
        <UiTrans>Activity</UiTrans>
      </h2>
      <LoadError
        error={query.error}
        message={
          query.isFetchNextPageError
            ? _t({ message: 'Could not load more activity.' })
            : _t({ message: 'Activity could not be loaded.' })
        }
        stale={Boolean(query.data) && !query.isFetchNextPageError}
        onRetry={() =>
          void (query.isFetchNextPageError ? showMore() : query.refetch())
        }
        retrying={query.isFetching}
      />
      {query.isPending ? (
        <ActivityFeedSkeleton />
      ) : events.length ? (
        <ol aria-label={_t({ message: 'Activity' })}>
          {events.slice(0, count).map((item) => (
            <ActivityFeedItem
              key={item.id}
              item={item}
              base={base}
              resources={resources}
            />
          ))}
        </ol>
      ) : !query.error ? (
        <p className="text-sm text-muted-foreground">
          <UiTrans>No activity yet. Project changes will appear here.</UiTrans>
        </p>
      ) : null}
      {count < events.length || query.hasNextPage ? (
        <div className="flex justify-start">
          <Button
            variant="secondary"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void showMore()}
          >
            <UiTrans>Show more</UiTrans>
          </Button>
        </div>
      ) : null}
    </section>
  )
}
