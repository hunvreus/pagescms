import { watchAccountNotifications } from '#/features/pending-writes/account-operation'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getDeletedLocalAccounts } from '#/client/api/local-account'
import { readAuthenticationState } from '#/client/api/authentication'
import { authClient } from '#/client/api/auth'
import { queryKeys } from '#/client/queries/keys'
import type { AuthenticationState } from '#/lib/authentication'
import {
  accountWasDeleted,
  clearDeletedAccountData,
  DELETED_ACCOUNTS_KEY,
  deletedAccounts,
  forgetDeletedAccount,
  localAccountReceipts,
  rememberLocalAccount,
} from './local-account-storage'

export function LocalAccountData() {
  const client = useQueryClient()
  useEffect(() => {
    const stopNotifications = watchAccountNotifications(client)
    let running = false
    let rerun = false
    let disposed = false
    const isMounted = () => !disposed
    const cleaned = new Set<string>()
    const current = () =>
      client.getQueryData<AuthenticationState>(queryKeys.session())
    function remember() {
      const state = current()
      if (
        state?.user &&
        state.localDataReceipt &&
        !accountWasDeleted(state.user.id)
      )
        rememberLocalAccount(state.user.id, state.localDataReceipt)
    }
    async function sweep() {
      if (!isMounted() || !current()) return
      if (running) {
        rerun = true
        return
      }
      running = true
      try {
        remember()
        const state = current()
        const active = state?.user?.id
        const markers = new Set(deletedAccounts())
        const deleted = new Set<string>()
        let signedOut = false
        if (active && markers.has(active) && state.localDataReceipt) {
          const removed = await getDeletedLocalAccounts({
            receipts: [state.localDataReceipt],
          })
          if (!isMounted() || current()?.user?.id !== active) return
          if (removed.includes(active)) {
            deleted.add(active)
            await authClient.signOut()
          } else {
            const confirmed = await readAuthenticationState()
            if (!isMounted() || current()?.user?.id !== active) return
            signedOut = !confirmed.user
            forgetDeletedAccount(active)
            cleaned.delete(active)
            remember()
          }
        }
        const receipts = Object.entries(localAccountReceipts())
          .filter(([account]) => account !== active)
          .map(([, receipt]) => receipt)
        for (let offset = 0; offset < receipts.length; offset += 50) {
          for (const account of await getDeletedLocalAccounts({
            receipts: receipts.slice(offset, offset + 50),
          }))
            deleted.add(account)
        }
        for (const account of deleted) {
          if (cleaned.has(account)) continue
          await clearDeletedAccountData(account)
          cleaned.add(account)
        }
        if (
          isMounted() &&
          active &&
          current()?.user?.id === active &&
          (signedOut || deleted.has(active))
        ) {
          await client.cancelQueries()
          client.clear()
          window.location.assign('/sign-in')
        }
      } catch {
        // Offline/blocked browser storage is retried on focus, without erasing
        // drafts merely because authentication or connectivity failed.
      } finally {
        running = false
        if (rerun) {
          rerun = false
          void sweep()
        }
      }
    }
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.type !== 'updated' ||
        event.action.type !== 'success' ||
        JSON.stringify(event.query.queryKey) !==
          JSON.stringify(queryKeys.session())
      )
        return
      remember()
      void sweep()
    })
    const storage = (event: StorageEvent) => {
      if (event.key === DELETED_ACCOUNTS_KEY) void sweep()
    }
    window.addEventListener('focus', sweep)
    window.addEventListener('storage', storage)
    void sweep()
    return () => {
      disposed = true
      stopNotifications()
      unsubscribe()
      window.removeEventListener('focus', sweep)
      window.removeEventListener('storage', storage)
    }
  }, [client])
  return null
}
