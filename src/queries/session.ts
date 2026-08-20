import { queryOptions } from '@tanstack/react-query'

import { getAccountSettings } from '#/functions/account'
import { getAuthenticationState } from '#/functions/auth'
import { getDashboardData } from '#/functions/projects'

import { queryKeys, queryTimes } from './keys'

export function authenticationQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.session(),
    queryFn: () => getAuthenticationState(),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function dashboardQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.dashboard(),
    queryFn: () => getDashboardData(),
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
  })
}

export function accountSettingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.settings(),
    queryFn: () => getAccountSettings(),
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
  })
}
