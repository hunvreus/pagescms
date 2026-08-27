import { createFileRoute, redirect } from '@tanstack/react-router'

import {
  UserSettings,
  UserSettingsSkeleton,
} from '#/features/settings/user-settings'
import { accountSettingsQueryOptions } from '#/queries/session'

export const Route = createFileRoute('/settings')({
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(accountSettingsQueryOptions())
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({ href: '/sign-in?redirect=%2Fsettings' })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: UserSettingsSkeleton,
  component: UserSettings,
})
