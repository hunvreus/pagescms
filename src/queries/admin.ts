import { queryOptions } from '@tanstack/react-query'

import { getAdminDashboard } from '#/functions/admin'

import { queryKeys, queryTimes } from './keys'

export function adminDashboardQueryOptions(input: {
  query: string
  page: number
  repoQuery?: string
  repoPage?: number
}) {
  return queryOptions({
    queryKey: [...queryKeys.admin(), input] as const,
    queryFn: () => getAdminDashboard({ data: input }),
    staleTime: 10_000,
    gcTime: queryTimes.gc,
  })
}
