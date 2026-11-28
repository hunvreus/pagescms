import { accountTitle } from '#/features/account/account-messages'
import { DocumentTitle } from '#/i18n/document-title'
import { translateMessage } from '#/i18n/message'
import { UserSettings } from '#/features/settings/user-settings'
import { pageTitle } from '#/lib/page-title'
import {
  createFileRoute,
  redirect,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { accountSettingsQueryOptions } from '#/client/queries/session'
import { requireConfirmedProfile } from '#/features/account/require-profile'

export const Route = createFileRoute('/settings')({
  loader: async ({ context, location }) => {
    try {
      await requireConfirmedProfile(context.queryClient, location.href)
      void context.queryClient.prefetchQuery(accountSettingsQueryOptions())
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: `/sign-in?redirect=${encodeURIComponent(location.href)}`,
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: lazyRouteComponent(
    () => import('#/features/settings/user-settings-skeleton'),
    'UserSettingsSkeleton',
  ),
  component: () => (
    <>
      <DocumentTitle message={accountTitle} />
      <UserSettings />
    </>
  ),
  head: ({ matches }) =>
    pageTitle(translateMessage(matches[0].context.i18n, accountTitle)),
})
