import { queryOptions } from '@tanstack/react-query'

import { getAccountSettings } from '#/client/api/account'
import { readAuthenticationState } from '#/client/api/authentication'
import { readDashboard } from '#/client/api/dashboard'

import { queryKeys, queryTimes } from './keys'

export function authenticationQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.session(),
    queryFn: () => readAuthenticationState(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    gcTime: Infinity,
  })
}

export function dashboardQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.dashboard(),
    queryFn: () => readDashboard(),
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
