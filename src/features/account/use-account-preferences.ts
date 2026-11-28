import { useEffect, useState } from 'react'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAccountPreferences,
  saveAccountPreferences,
} from '#/client/api/account'
import { resolveEditingPreferences } from '#/shared/account-preferences'
import { accountSettingsQueryOptions } from '#/client/queries/session'
import { useOperation } from '#/features/pending-writes/use-operation'
import type {
  AccountPreferences,
  EditingPreferences,
} from '#/shared/account-preferences'

export function accountPreferencesQueryOptions(accountId?: string) {
  return queryOptions({
    queryKey: ['account-preferences', accountId],
    enabled: Boolean(accountId),
    queryFn: () => getAccountPreferences({ accountId: accountId! }),
    staleTime: 30_000,
  })
}
export function useAccountPreferences(accountId?: string) {
  const client = useQueryClient()
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const settings = client.getQueryData(accountSettingsQueryOptions().queryKey)
  const state = useQuery({
    ...accountPreferencesQueryOptions(accountId),
    initialData:
      settings && settings.user.id === accountId
        ? settings.preferences
        : undefined,
    initialDataUpdatedAt: client.getQueryState(
      accountSettingsQueryOptions().queryKey,
    )?.dataUpdatedAt,
  })
  const operation = useOperation<
    Awaited<ReturnType<typeof saveAccountPreferences>>
  >('account-preferences')
  return {
    editing: resolveEditingPreferences(state.data),
    ready: Boolean(accountId && state.data !== undefined),
    canSave: ready && state.isSuccess,
    busy: operation.pending,
    fetching: state.isFetching,
    error: state.error,
    retry: state.refetch,
    async save(editing: EditingPreferences, successMessage?: string) {
      if (!accountId || !state.isSuccess || operation.pending) return false
      const key = accountPreferencesQueryOptions(accountId).queryKey
      const active = accountIsActive(client, accountId)
      let previous: AccountPreferences | undefined
      let optimistic: AccountPreferences | undefined
      try {
        await operation.run({
          successMessage,
          prepare: async () => {
            await client.cancelQueries({ queryKey: key })
            if (!active()) return
            previous = client.getQueryData(key)
            optimistic = {
              ...previous,
              editing: { ...previous?.editing, ...editing },
            }
            client.setQueryData(key, optimistic)
            optimistic = client.getQueryData(key)
          },
          expectedAccount: accountId,
          run: () => saveAccountPreferences({ accountId, editing }),
          confirmed: (preferences, current) => {
            if (!current()) return
            client.setQueryData(
              accountPreferencesQueryOptions(accountId).queryKey,
              preferences,
            )
            client.setQueryData(
              accountSettingsQueryOptions().queryKey,
              (cached) =>
                cached?.user.id === accountId
                  ? { ...cached, preferences }
                  : cached,
            )
          },
        })
        return active()
      } catch {
        if (optimistic && client.getQueryData(key) === optimistic)
          client.setQueryData(key, previous)
        // The operation owns the single failure notification; leave the previous value selected.
        return false
      }
    },
  }
}
