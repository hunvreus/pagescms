import { useLingui as useUiMessages } from '@lingui/react/macro'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  toast,
  notifyError,
  OperationAcknowledgementError,
} from '#/lib/notifications'
import {
  accountSettingsQueryOptions,
  authenticationQueryOptions,
} from '#/client/queries/session'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { createProfileEditor } from './profile-editor'
import { useProfileUpdate } from './use-profile-update'

const profiles = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof createProfileEditor>>
>()

export function useProfileEditor(user: {
  id: string
  name: string
  image: string | null
}) {
  const { t: _t } = useUiMessages()

  const client = useQueryClient()
  const { mutateAsync } = useProfileUpdate()
  const [controller] = useState(() => {
    let accounts = profiles.get(client)
    if (!accounts) {
      accounts = new Map()
      profiles.set(client, accounts)
      const current = accounts
      client.getQueryCache().subscribe(() => {
        for (const [id, pending] of current) {
          if (accountIsActive(client, id)()) continue
          pending.abandon()
          current.delete(id)
        }
      })
    }
    let profile = accounts.get(user.id)
    if (!profile) {
      profile = createProfileEditor({
        accountId: user.id,
        profile: { name: user.name, image: user.image },
        active: accountIsActive(client, user.id),
        save: mutateAsync,
        notify: (notice) => {
          if (!accountIsActive(client, user.id)()) return
          const id = `account-profile-${user.id}-${notice.field}`
          if (notice.type === 'success')
            toast.success(_t({ message: 'Profile updated' }), { id })
          else {
            if (notice.error instanceof OperationAcknowledgementError) {
              void client
                .invalidateQueries({
                  queryKey: accountSettingsQueryOptions().queryKey,
                })
                .catch(() => {})
              void client
                .invalidateQueries({
                  queryKey: authenticationQueryOptions().queryKey,
                })
                .catch(() => {})
            }
            notifyError(
              notice.error,
              notice.field === 'name'
                ? _t({ message: 'Could not save your name. Try again.' })
                : _t({ message: 'Could not save your picture. Try again.' }),
              {
                id,
                action: notice.retry
                  ? { label: _t({ message: 'Retry' }), onClick: notice.retry }
                  : undefined,
              },
            )
          }
        },
      })
      accounts.set(user.id, profile)
    }
    return profile
  })
  controller.setSave(mutateAsync)
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  useEffect(() => {
    controller.sync({ name: user.name, image: user.image })
  }, [controller, user.name, user.image])
  return { ...state, ready, ...controller }
}
