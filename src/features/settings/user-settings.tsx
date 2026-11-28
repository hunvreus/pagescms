import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { Skeleton } from '#/components/ui/skeleton'
import { LoadError } from '#/components/operation-error'
import type { CurrentUser } from '#/lib/authentication'
import { HugeiconsIcon } from '@hugeicons/react'
import { AccountSettingsContribution } from './account-settings-contribution'
import { Spinner } from '#/components/ui/spinner'
import { useState } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import Ellipsis from '@hugeicons/core-free-icons/EllipsisIcon'

import { notifyError } from '#/lib/notifications'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { SettingsLayout } from '#/components/settings-layout'
import { accountNavigation } from './settings-navigation'
import { ProfileSettings } from '#/features/account/profile-settings'
import { DeleteAccount } from '#/features/account/delete-account'
import { ContentEditingPreferences } from '#/features/account/content-editing-preferences'
import { settingsRowClassName } from '#/components/settings-row'
import { authClient, signIn } from '#/client/api/auth'
import { queryKeys } from '#/client/queries/keys'
import { UserSettingsSkeleton } from './user-settings-skeleton'
import {
  accountSettingsQueryOptions,
  authenticationQueryOptions,
} from '#/client/queries/session'
import type { readSettings as getAccountSettings } from '#/server/services/account'

export function UserSettings() {
  const state = useQuery(accountSettingsQueryOptions())
  const { data: auth } = useQuery(authenticationQueryOptions())
  const data = state.data
  const user = data?.user ?? auth?.user
  if (!user)
    return (
      <UserSettingsSkeleton
        error={state.error}
        onRetry={() => void state.refetch()}
        retrying={state.isFetching}
      />
    )
  return (
    <AccountSettings
      key={user.id}
      user={user}
      data={data}
      isAdmin={auth?.isAdmin ?? false}
      error={state.error}
      retrying={state.isFetching}
      onRetry={() => void state.refetch()}
    />
  )
}

function AccountSettings({
  data,
  user,
  isAdmin,
  error,
  retrying,
  onRetry,
}: {
  data?: Awaited<ReturnType<typeof getAccountSettings>>
  user: CurrentUser
  isAdmin: boolean
  error: unknown
  retrying: boolean
  onRetry: () => void
}) {
  const { t: _t } = useUiMessages()

  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  async function connectGithub() {
    setConnecting(true)
    try {
      const result = await signIn.social({
        provider: 'github',
        callbackURL: '/settings#security',
        errorCallbackURL: '/settings#security',
        disableRedirect: true,
      })
      if (result.error) throw result.error
      if (!result.data.url) throw new Error('OAuth authorization URL missing')
      window.location.assign(result.data.url)
    } catch {
      notifyError(
        null,
        _t({ message: 'GitHub connection is temporarily unavailable.' }),
        {
          account: user.id,
        },
      )
      setConnecting(false)
    }
  }

  async function disconnectGithub() {
    if (!window.confirm(_t({ message: 'Disconnect your GitHub account?' })))
      return
    setDisconnecting(true)
    try {
      if (!data?.githubAccountId) {
        notifyError(
          null,
          _t({ message: 'The connected GitHub account was not found.' }),
          {
            account: user.id,
          },
        )
        return
      }
      const result = await authClient.unlinkAccount({
        accountId: data.githubAccountId,
      })
      if (result.error) throw result.error
      const { toast } = await import('#/lib/notifications')
      toast.success(_t({ message: 'GitHub account disconnected' }))
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() })
    } catch {
      notifyError(
        null,
        _t({ message: 'Could not disconnect the GitHub account.' }),
        {
          account: user.id,
        },
      )
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <SettingsLayout
      area="Account"
      items={accountNavigation.filter(
        (item) => item.id !== 'installations' || data?.githubConnected === true,
      )}
      isAdmin={data?.isAdmin ?? isAdmin}
      user={user}
    >
      <LoadError
        error={error}
        message={_t({ message: 'Could not load account settings' })}
        stale={Boolean(data)}
        onRetry={onRetry}
        retrying={retrying}
      />
      <div id="profile" className="scroll-mt-6">
        <ProfileSettings user={user} />
      </div>

      <section id="security" className="scroll-mt-6 space-y-3">
        <div className={sectionHeaderClassName}>
          <h2 className="text-base font-medium">
            <UiTrans>Sign-in methods</UiTrans>
          </h2>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card px-4">
          <ul>
            <li className={rowClassName}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <UiTrans>Email</UiTrans>
                </p>
                <p className="mt-0.5 truncate text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </li>
            <li className={rowClassName}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">GitHub</p>
                <p className="mt-0.5 truncate text-muted-foreground">
                  {!data ? (
                    error ? (
                      _t({ message: 'Unavailable' })
                    ) : (
                      <Skeleton className="h-5 w-48 max-w-full" />
                    )
                  ) : data.githubConnected ? (
                    user.githubUsername ? (
                      `@${user.githubUsername}`
                    ) : (
                      _t({ message: 'Connected' })
                    )
                  ) : (
                    _t({
                      message: 'Connect to access your GitHub repositories.',
                    })
                  )}
                </p>
              </div>
              {!data ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled
                  aria-label={_t({ message: 'GitHub connection actions' })}
                >
                  <HugeiconsIcon aria-hidden="true" icon={Ellipsis} />
                </Button>
              ) : data.githubConnected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-busy={disconnecting}
                      aria-label={_t({
                        message: 'GitHub connection actions',
                      })}
                      className="ml-auto"
                      disabled={disconnecting}
                      size="icon-sm"
                      variant="outline"
                    >
                      {disconnecting ? (
                        <Spinner aria-hidden="true" />
                      ) : (
                        <HugeiconsIcon aria-hidden="true" icon={Ellipsis} />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-max min-w-32 max-w-[calc(100vw-2rem)]"
                  >
                    {data.githubManageUrl ? (
                      <DropdownMenuItem asChild>
                        <a
                          href={data.githubManageUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <UiTrans>Manage</UiTrans>
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => void disconnectGithub()}
                    >
                      <UiTrans>Disconnect</UiTrans>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : data.githubAvailable ? (
                <Button
                  aria-busy={connecting}
                  className="ml-auto"
                  disabled={connecting}
                  size="xs"
                  variant="outline"
                  onClick={() => void connectGithub()}
                >
                  <UiTrans>Connect</UiTrans>
                  {connecting ? (
                    <Spinner aria-hidden="true" data-icon="inline-end" />
                  ) : null}
                </Button>
              ) : (
                <span className="ml-auto text-muted-foreground">
                  <UiTrans>Unavailable</UiTrans>
                </span>
              )}
            </li>
          </ul>
        </div>
      </section>

      <div id="preferences" className="scroll-mt-6">
        <ContentEditingPreferences accountId={user.id} />
      </div>

      {data?.githubConnected ? (
        <section id="installations" className="scroll-mt-6 space-y-3">
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-medium">
              <UiTrans>Installations</UiTrans>
            </h2>
            {data.githubAppInstallAvailable ? (
              <Button asChild variant="outline">
                <a
                  href="/api/github-app/install"
                  target="_blank"
                  rel="noreferrer"
                >
                  <UiTrans>Install on another account</UiTrans>
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={ArrowUpRight}
                    className="opacity-50"
                    data-icon="inline-end"
                  />
                </a>
              </Button>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-xl border bg-card px-4">
            {data.accounts.length ? (
              <ul>
                {data.accounts.map((account) => (
                  <li
                    className={rowClassName}
                    key={`${account.login}:${account.installationId}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        alt={_t({ message: `${account.login}'s avatar` })}
                        className="size-9 shrink-0 rounded-lg"
                        height="36"
                        src={`https://github.com/${encodeURIComponent(account.login)}.png?size=64`}
                        width="36"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{account.login}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {account.type === 'org'
                            ? _t({ message: 'Organization' })
                            : _t({ message: 'Personal account' })}
                        </p>
                      </div>
                    </div>
                    <Button
                      asChild
                      className="ml-auto"
                      size="sm"
                      variant="outline"
                    >
                      <a
                        href={installationUrl(account)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <UiTrans>Manage</UiTrans>
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={ArrowUpRight}
                          className="opacity-50"
                          data-icon="inline-end"
                        />
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                <UiTrans>No GitHub App installations found.</UiTrans>
              </p>
            )}
          </div>
        </section>
      ) : null}
      <AccountSettingsContribution accountId={user.id} />
      <div id="delete-account" className="scroll-mt-6">
        <DeleteAccount user={user} />
      </div>
    </SettingsLayout>
  )
}

const rowClassName = `${settingsRowClassName} border-b py-4 text-sm last:border-b-0`

const sectionHeaderClassName =
  'flex min-h-7 flex-wrap items-center justify-between gap-3'

function installationUrl(account: {
  type: 'org' | 'user'
  login: string
  installationId: number
}) {
  return account.type === 'org'
    ? `https://github.com/organizations/${encodeURIComponent(account.login)}/settings/installations/${account.installationId}`
    : `https://github.com/settings/installations/${account.installationId}`
}
