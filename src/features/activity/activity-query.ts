import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '#/client/queries/keys'

export function invalidateActivity(
  client: QueryClient,
  coordinates: { owner: string; repo: string },
) {
  const prefix = queryKeys.repository(coordinates)
  // Repository-wide membership events can affect every branch, without refreshing
  // unrelated editors, media leases or workflow status queries.
  void client
    .invalidateQueries({
      queryKey: prefix,
      predicate: (query) => query.queryKey[prefix.length + 1] === 'activity',
    })
    .catch(() => {})
}
