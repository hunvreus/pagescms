import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import {
  profileFieldCopy,
  deleteAccountDescription,
} from '#/features/account/account-copy'
import { stackedSettingsRowClassName } from '#/components/settings-row'
import { SettingsLayout } from '#/components/settings-layout'
import { Skeleton } from '#/components/ui/skeleton'
import { LoadError } from '#/components/operation-error'
import { accountNavigation } from './settings-navigation'
import { ContentEditingPreferences } from '#/features/account/content-editing-preferences'
import { AccountSettingsLoading } from './account-settings-contribution'
import { Button } from '#/components/ui/button'

export function UserSettingsSkeleton({
  error,
  onRetry,
  retrying,
}: {
  error?: unknown
  onRetry?: () => void
  retrying?: boolean
}) {
  const { t: _t, i18n: _i18n } = useUiMessages()

  if (error) {
    return (
      <SettingsLayout area="Account" items={accountNavigation}>
        <LoadError
          error={error}
          message={_t({ message: 'Could not load account settings' })}
          onRetry={onRetry}
          retrying={retrying}
        />
      </SettingsLayout>
    )
  }
  return (
    <SettingsLayout area="Account" items={accountNavigation}>
      <div id="profile" className="scroll-mt-6">
        <section className="space-y-3">
          <h2 className="flex min-h-7 items-center text-base font-medium">
            <UiTrans>Profile</UiTrans>
          </h2>
          <div
            role="status"
            aria-label={_t({ message: 'Loading profile' })}
            className="divide-y rounded-xl border bg-card px-4"
          >
            {Object.entries(profileFieldCopy).map(
              ([key, { label, description }]) => (
                <div
                  key={key}
                  className={`${stackedSettingsRowClassName} py-4`}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {typeof label === 'string'
                        ? label === 'Email'
                          ? _t({ message: 'Email' })
                          : label
                        : _i18n._(label)}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {_i18n._(description)}
                    </p>
                  </div>
                  <Skeleton
                    className={
                      key === 'picture' ? 'size-9 rounded-full' : 'h-8 w-full'
                    }
                  />
                </div>
              ),
            )}
          </div>
        </section>
      </div>
      <section id="security" className="scroll-mt-6 space-y-3">
        <h2 className="flex min-h-7 items-center text-base font-medium">
          <UiTrans>Sign-in methods</UiTrans>
        </h2>
        <div
          role="status"
          aria-label={_t({ message: 'Loading sign-in methods' })}
          className="divide-y rounded-xl border bg-card px-4"
        >
          {['Email', 'GitHub'].map((label) => (
            <div className="space-y-0.5 py-4 text-sm" key={label}>
              <p className="font-medium">
                {typeof label === 'string'
                  ? label === 'Email'
                    ? _t({ message: 'Email' })
                    : label
                  : _i18n._(label)}
              </p>
              <Skeleton className="h-5 w-48 max-w-full" />
            </div>
          ))}
        </div>
      </section>

      <>
        <div id="preferences" className="scroll-mt-6">
          <ContentEditingPreferences />
        </div>
        <AccountSettingsLoading />
        <section id="delete-account" className="scroll-mt-6 space-y-3">
          <h2 className="text-base font-medium">
            <UiTrans>Danger zone</UiTrans>
          </h2>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">
              <UiTrans>Delete account</UiTrans>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {_i18n._(deleteAccountDescription)}
            </p>
            <Button disabled variant="destructive">
              <UiTrans>Delete account</UiTrans>
            </Button>
          </div>
        </section>
      </>
    </SettingsLayout>
  )
}
