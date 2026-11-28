import { useQueryClient } from '@tanstack/react-query'
import { useOperation } from '#/features/pending-writes/use-operation'
import { updateProfile } from '#/client/api/account'
import {
  accountSettingsQueryOptions,
  authenticationQueryOptions,
  dashboardQueryOptions,
} from '#/client/queries/session'
import type { ProfileUpdate } from '#/lib/profile'

export function useProfileUpdate() {
  const client = useQueryClient()
  const operation =
    useOperation<Awaited<ReturnType<typeof updateProfile>>>('account-profile')
  return {
    isPending: operation.pending,
    error: operation.error,
    mutateAsync(data: ProfileUpdate & { accountId: string }) {
      const { accountId } = data
      return operation.run({
        handledError: () => true, // Profile editor/onboarding owns validation and retry UI.
        expectedAccount: accountId,
        prepare: () =>
          client.cancelQueries({
            queryKey: accountSettingsQueryOptions().queryKey,
          }),
        run: () => updateProfile(data),
        confirmed: async (profile, active) => {
          await client.cancelQueries({
            queryKey: accountSettingsQueryOptions().queryKey,
          })
          if (!active()) return
          void client.invalidateQueries({
            queryKey: authenticationQueryOptions().queryKey,
          })
          client.setQueryData(authenticationQueryOptions().queryKey, (auth) =>
            auth?.user?.id === accountId
              ? {
                  ...auth,
                  user: { ...auth.user, ...profile },
                  profileCompleted: true,
                }
              : auth,
          )
          client.setQueryData(
            accountSettingsQueryOptions().queryKey,
            (settings) =>
              settings?.user.id === accountId
                ? {
                    ...settings,
                    user: { ...settings.user, ...profile },
                  }
                : settings,
          )
          client.setQueryData(dashboardQueryOptions().queryKey, (dashboard) =>
            dashboard?.user.id === accountId
              ? { ...dashboard, user: { ...dashboard.user, ...profile } }
              : dashboard,
          )
        },
      })
    },
  }
}
