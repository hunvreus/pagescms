import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowUpRight, Ellipsis, LoaderCircle, Upload } from 'lucide-react'

import { OperationError } from '#/components/operation-error'
import { PageHeader } from '#/components/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { updateProfile } from '#/functions/account'
import { createBillingSession } from '#/functions/billing'
import { AppHeader, AppHeaderSkeleton } from '#/features/account/app-header'
import { authClient, signIn } from '#/lib/auth-client'
import { queryKeys } from '#/queries/keys'
import { accountSettingsQueryOptions } from '#/queries/session'

export function UserSettings() {
  const { data } = useSuspenseQuery(accountSettingsQueryOptions())
  const queryClient = useQueryClient()
  const [name, setName] = useState(data.user.name)
  const [saving, setSaving] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const avatar =
    data.user.image ??
    (data.user.githubUsername
      ? `https://github.com/${encodeURIComponent(data.user.githubUsername)}.png?size=128`
      : `https://unavatar.io/${encodeURIComponent(data.user.email)}?fallback=false`)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ data: { name } })
      const { toast } = await import('sonner')
      toast.success('Profile updated')
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() })
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  async function openBilling(intent: 'checkout' | 'portal', priceId?: string) {
    setBillingBusy(true)
    setError(null)
    try {
      const { url } = await createBillingSession({
        data: { intent, priceId, idempotencyKey: crypto.randomUUID() },
      })
      window.location.assign(url)
    } catch (cause) {
      setError(cause)
      setBillingBusy(false)
    }
  }

  async function connectGithub() {
    setConnecting(true)
    setError(null)
    try {
      const result = await signIn.social({
        provider: 'github',
        callbackURL: '/settings',
        errorCallbackURL: '/settings',
        disableRedirect: true,
      })
      if (result.error) throw result.error
      if (!result.data.url) throw new Error('OAuth authorization URL missing')
      window.location.assign(result.data.url)
    } catch {
      setError(new Error('GitHub connection is temporarily unavailable.'))
      setConnecting(false)
    }
  }

  async function disconnectGithub() {
    if (!window.confirm('Disconnect your GitHub account from Pages CMS?'))
      return
    setDisconnecting(true)
    setError(null)
    try {
      if (!data.githubAccountId) {
        setError(new Error('The connected GitHub account was not found.'))
        return
      }
      const result = await authClient.unlinkAccount({
        accountId: data.githubAccountId,
      })
      if (result.error) throw result.error
      const { toast } = await import('sonner')
      toast.success('GitHub account disconnected')
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() })
    } catch {
      setError(new Error('Could not disconnect the GitHub account.'))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader isAdmin={data.isAdmin} user={data.user} />
      <main className="mx-auto w-full max-w-[808px] space-y-10 p-4 pt-20 pb-8 md:p-6 md:pt-22 md:pb-10">
        <PageHeader title="User settings" />
        <OperationError error={error} fallback="Could not update settings." />

        {data.entitlement ? (
          <section className="space-y-3">
            <div className={sectionHeaderClassName}>
              <h2 className="text-sm font-medium">Plan</h2>
              <Badge variant="secondary">{data.entitlement.planLabel}</Badge>
            </div>
            {data.entitlement.usage.length ? (
              <div className="overflow-hidden rounded-xl border bg-card">
                <ul>
                  {data.entitlement.usage.map((counter) => (
                    <li className={rowClassName} key={counter.key}>
                      <span className="font-medium">{counter.label}</span>
                      <span className="ml-auto text-muted-foreground">
                        {counter.used}
                        {counter.limit === null ? '' : ` of ${counter.limit}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.billing ? (
              <div className="flex flex-wrap justify-end gap-2">
                {data.billing.canManage ? (
                  <Button
                    disabled={billingBusy}
                    size="sm"
                    variant="outline"
                    onClick={() => void openBilling('portal')}
                  >
                    Manage billing
                  </Button>
                ) : (
                  data.billing.plans.map((plan) => (
                    <Button
                      key={plan.id}
                      disabled={billingBusy}
                      size="sm"
                      onClick={() => void openBilling('checkout', plan.id)}
                    >
                      Upgrade to {plan.label}
                    </Button>
                  ))
                )}
              </div>
            ) : data.entitlement.upgradeUrl ||
              data.entitlement.billingPortalUrl ? (
              <div className="flex justify-end gap-2">
                {data.entitlement.billingPortalUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={data.entitlement.billingPortalUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Manage billing
                    </a>
                  </Button>
                ) : null}
                {data.entitlement.upgradeUrl ? (
                  <Button asChild size="sm">
                    <a
                      href={data.entitlement.upgradeUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Upgrade
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className={sectionHeaderClassName}>
            <h2 className="text-sm font-medium">Profile</h2>
            <div className="flex justify-end">
              <Button
                disabled={saving || name.trim() === data.user.name.trim()}
                form="profile-form"
                size="sm"
                type="submit"
              >
                {saving ? <LoaderCircle className="animate-spin" /> : null}
                {saving ? 'Saving' : 'Save profile'}
              </Button>
            </div>
          </div>
          <form
            id="profile-form"
            className="divide-y overflow-hidden rounded-xl border bg-card"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <div className="grid items-center gap-3 p-4 sm:grid-cols-2">
              <div>
                <label
                  className="block text-sm font-medium leading-5"
                  htmlFor="profile-name"
                >
                  Name
                </label>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Displayed in your profile and collaborator lists.
                </p>
              </div>
              <Input
                id="profile-name"
                maxLength={120}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid items-center gap-3 p-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Picture</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Your account image, or initials when unavailable.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage
                    alt={data.user.name || data.user.email}
                    src={avatar}
                  />
                  <AvatarFallback>
                    {initials(data.user.name || data.user.email)}
                  </AvatarFallback>
                </Avatar>
                <Button disabled size="sm" variant="outline">
                  <Upload />
                  Upload
                </Button>
              </div>
            </div>
          </form>
        </section>

        <section className="space-y-3">
          <div className={sectionHeaderClassName}>
            <h2 className="text-sm font-medium">Sign-in methods</h2>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul>
              <li className={rowClassName}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Email</p>
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {data.user.email}
                  </p>
                </div>
              </li>
              <li className={rowClassName}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">GitHub</p>
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {data.githubConnected
                      ? data.user.githubUsername
                        ? `@${data.user.githubUsername}`
                        : 'Connected'
                      : 'Connect to access your GitHub repositories.'}
                  </p>
                </div>
                {data.githubConnected ? (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="GitHub connection actions"
                          className="ml-auto"
                          disabled={disconnecting}
                          size="icon-xs"
                          variant="outline"
                        >
                          {disconnecting ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Ellipsis />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {data.githubManageUrl ? (
                          <DropdownMenuItem asChild>
                            <a
                              href={data.githubManageUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Manage
                            </a>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => void disconnectGithub()}
                        >
                          Disconnect
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : data.githubAvailable ? (
                  <Button
                    className="ml-auto"
                    disabled={connecting}
                    size="xs"
                    variant="outline"
                    onClick={() => void connectGithub()}
                  >
                    {connecting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : null}
                    Connect
                  </Button>
                ) : (
                  <span className="ml-auto text-muted-foreground">
                    Unavailable
                  </span>
                )}
              </li>
            </ul>
          </div>
        </section>

        {data.githubConnected ? (
          <section className="space-y-3">
            <div className={sectionHeaderClassName}>
              <h2 className="text-sm font-medium">Installations</h2>
              {data.githubAppInstallAvailable ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href="/api/github-app/install"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Install on another account
                    <ArrowUpRight className="opacity-50" />
                  </a>
                </Button>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
              {data.accounts.length ? (
                <ul>
                  {data.accounts.map((account) => (
                    <li
                      className={rowClassName}
                      key={`${account.login}:${account.installationId}`}
                    >
                      <img
                        alt={`${account.login}'s avatar`}
                        className="size-8 shrink-0 rounded-lg"
                        height="32"
                        src={`https://github.com/${encodeURIComponent(account.login)}.png?size=64`}
                        width="32"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{account.login}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {account.type === 'org'
                            ? 'Organization'
                            : 'Personal account'}
                        </p>
                      </div>
                      <Button
                        asChild
                        className="ml-auto"
                        size="xs"
                        variant="outline"
                      >
                        <a
                          href={installationUrl(account)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Manage
                          <ArrowUpRight className="opacity-50" />
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  No GitHub App installations found.
                </p>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

const rowClassName =
  'flex min-w-0 items-center gap-3 border-b p-4 text-sm last:border-b-0'

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

function initials(value: string) {
  return value
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export function UserSettingsSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeaderSkeleton />
      <main
        aria-label="Loading user settings"
        className="mx-auto w-full max-w-[808px] space-y-10 p-4 pt-20 pb-8 md:p-6 md:pt-22 md:pb-10"
      >
        <PageHeader title="User settings" />
        <ProfileSectionSkeleton />
        <SignInMethodsSectionSkeleton />
        <InstallationsSectionSkeleton />
      </main>
    </div>
  )
}

function SettingsSectionHeaderSkeleton({ titleWidth }: { titleWidth: string }) {
  return (
    <h2 className="flex h-7 items-center text-sm font-medium">
      <Skeleton className={`h-4 ${titleWidth}`} />
    </h2>
  )
}

function ProfileSectionSkeleton() {
  return (
    <section className="space-y-3">
      <div className={sectionHeaderClassName}>
        <SettingsSectionHeaderSkeleton titleWidth="w-12" />
        <Skeleton className="h-7 w-24 rounded-lg" />
      </div>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="grid items-center gap-3 p-4 sm:grid-cols-2"
          >
            <div className="space-y-0.5">
              <TextSkeleton className="w-14" />
              <TextSkeleton className="w-full max-w-64" />
            </div>
            {index === 0 ? (
              <Skeleton className="h-8 w-full rounded-lg" />
            ) : (
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function SignInMethodsSectionSkeleton() {
  return (
    <section className="space-y-3">
      <SettingsSectionHeaderSkeleton titleWidth="w-28" />
      <div className="overflow-hidden rounded-xl border bg-card">
        <div>
          {[0, 1].map((index) => (
            <div className={rowClassName} key={index}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <TextSkeleton className="w-14" />
                <TextSkeleton className="w-28" />
              </div>
              {index === 1 ? (
                <Skeleton className="ml-auto size-6 rounded-md" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function InstallationsSectionSkeleton() {
  return (
    <section className="space-y-3">
      <div className={sectionHeaderClassName}>
        <SettingsSectionHeaderSkeleton titleWidth="w-24" />
        <Skeleton className="h-7 w-48 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div>
          {[0, 1, 2].map((index) => (
            <div className={rowClassName} key={index}>
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <TextSkeleton className="w-28" />
                <TextSkeleton className="w-24" />
              </div>
              <Skeleton className="ml-auto h-6 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TextSkeleton({ className }: { className: string }) {
  return (
    <span className="flex h-5 items-center">
      <Skeleton className={`h-4 ${className}`} />
    </span>
  )
}
