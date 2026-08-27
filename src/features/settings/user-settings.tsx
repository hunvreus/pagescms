import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowUpRight, Ellipsis, LoaderCircle, Mail } from 'lucide-react'

import { GitHubIcon } from '#/components/github-icon'
import { OperationError } from '#/components/operation-error'
import { PageHeader } from '#/components/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { updateProfile } from '#/functions/account'
import { AppHeader, AppHeaderSkeleton } from '#/features/account/app-header'
import { authClient, signIn } from '#/lib/auth-client'
import { queryKeys } from '#/queries/keys'
import { accountSettingsQueryOptions } from '#/queries/session'

export function UserSettings() {
  const { data } = useSuspenseQuery(accountSettingsQueryOptions())
  const queryClient = useQueryClient()
  const [name, setName] = useState(data.user.name)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const avatar =
    data.user.image ??
    (data.user.githubUsername
      ? `https://github.com/${encodeURIComponent(data.user.githubUsername)}.png?size=128`
      : `https://unavatar.io/${encodeURIComponent(data.user.email)}?fallback=false`)

  async function save() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await updateProfile({ data: { name } })
      setMessage('Profile updated')
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() })
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  async function connectGithub() {
    setConnecting(true)
    setMessage(null)
    setError(null)
    try {
      const result = await signIn.social({
        provider: 'github',
        callbackURL: '/settings',
        errorCallbackURL: '/settings',
        disableRedirect: true,
      })
      if (result.error?.message) throw new Error(result.error.message)
      if (!result.data?.url) throw new Error('GitHub connection did not start')
      window.location.assign(result.data.url)
    } catch (cause) {
      setError(cause)
      setConnecting(false)
    }
  }

  async function disconnectGithub() {
    if (!window.confirm('Disconnect your GitHub account from Pages CMS?'))
      return
    setDisconnecting(true)
    setMessage(null)
    setError(null)
    try {
      if (!data.githubAccountId) throw new Error('GitHub account not found')
      const result = await authClient.unlinkAccount({
        accountId: data.githubAccountId,
      })
      if (result.error?.message) throw new Error(result.error.message)
      setMessage('GitHub account disconnected')
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() })
    } catch (cause) {
      setError(cause)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader isAdmin={data.isAdmin} user={data.user} />
      <main className="mx-auto w-full max-w-screen-sm space-y-8 p-4 pt-20 pb-8 md:p-6 md:pt-22 md:pb-10">
        <PageHeader title="User settings" />
        {message ? (
          <div className="rounded-lg border bg-card p-3 text-sm">{message}</div>
        ) : null}
        <OperationError error={error} fallback="Could not update settings." />

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Information displayed to collaborators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id="profile-form"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <FieldGroup className="gap-4">
                <Field orientation="horizontal">
                  <div className="w-20 shrink-0 pt-2">
                    <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                  </div>
                  <FieldContent>
                    <Input
                      id="profile-name"
                      maxLength={120}
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <div className="w-20 shrink-0 pt-2">
                    <FieldLabel>Picture</FieldLabel>
                  </div>
                  <FieldContent>
                    <Avatar className="size-16 rounded-lg after:rounded-lg">
                      <AvatarImage
                        alt={data.user.name || data.user.email}
                        className="rounded-lg"
                        src={avatar}
                      />
                      <AvatarFallback className="rounded-lg">
                        {initials(data.user.name || data.user.email)}
                      </AvatarFallback>
                    </Avatar>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              disabled={saving || name.trim() === data.user.name.trim()}
              form="profile-form"
              type="submit"
            >
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              {saving ? 'Saving' : 'Save profile'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Authentication</CardTitle>
            <CardDescription>Linked sign-in methods.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul>
              <li className={rowClassName}>
                <Mail className="size-4 shrink-0" />
                <span className="font-medium">Email</span>
                <span className="truncate text-muted-foreground">
                  {data.user.email}
                </span>
              </li>
              <li className={rowClassName}>
                <GitHubIcon className="size-4 shrink-0" />
                <span className="font-medium">GitHub</span>
                {data.githubConnected ? (
                  <>
                    <span className="truncate text-muted-foreground">
                      {data.user.githubUsername
                        ? `@${data.user.githubUsername}`
                        : 'Connected'}
                    </span>
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
                        {data.githubManageUrl ? (
                          <DropdownMenuSeparator />
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
          </CardContent>
        </Card>

        {data.githubConnected ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Installations</CardTitle>
              <CardDescription>
                GitHub App accounts available to Pages CMS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.accounts.length ? (
                <ul>
                  {data.accounts.map((account) => (
                    <li
                      className={rowClassName}
                      key={`${account.login}:${account.installationId}`}
                    >
                      <img
                        alt={`${account.login}'s avatar`}
                        className="size-6 rounded"
                        height="24"
                        src={`https://github.com/${encodeURIComponent(account.login)}.png?size=48`}
                        width="24"
                      />
                      <span className="truncate font-medium">
                        {account.login}
                      </span>
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
                <p className="text-sm text-muted-foreground">
                  No GitHub App installations found.
                </p>
              )}
            </CardContent>
            {data.githubAppInstallAvailable ? (
              <CardFooter className="justify-end">
                <Button asChild size="sm" variant="outline">
                  <a href="/api/github-app/install">
                    Install on another account
                    <ArrowUpRight className="opacity-50" />
                  </a>
                </Button>
              </CardFooter>
            ) : null}
          </Card>
        ) : null}
      </main>
    </div>
  )
}

const rowClassName =
  'flex items-center gap-2 border border-b-0 px-3 py-2 text-sm first:rounded-t-md last:rounded-b-md last:border-b'

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
        className="mx-auto w-full max-w-screen-sm space-y-8 p-4 pt-20 pb-8 md:p-6 md:pt-22 md:pb-10"
      >
        <PageHeader title="User settings" />
        <ProfileCardSkeleton />
        <AuthenticationCardSkeleton />
        <InstallationsCardSkeleton />
      </main>
    </div>
  )
}

function SettingsCardHeaderSkeleton({
  descriptionWidth,
  titleWidth,
}: {
  descriptionWidth: string
  titleWidth: string
}) {
  return (
    <CardHeader className="border-b">
      <CardTitle className="flex h-[22px] items-center">
        <Skeleton className={`h-4 ${titleWidth}`} />
      </CardTitle>
      <CardDescription className="flex h-5 items-center">
        <Skeleton className={`h-4 max-w-full ${descriptionWidth}`} />
      </CardDescription>
    </CardHeader>
  )
}

function ProfileCardSkeleton() {
  return (
    <Card>
      <SettingsCardHeaderSkeleton descriptionWidth="w-60" titleWidth="w-12" />
      <CardContent>
        <FieldGroup className="gap-4">
          <Field orientation="horizontal">
            <div className="w-20 shrink-0 pt-2">
              <Skeleton className="h-4 w-10" />
            </div>
            <FieldContent>
              <Skeleton className="h-8 w-full rounded-lg" />
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <div className="w-20 shrink-0 pt-2">
              <Skeleton className="h-4 w-12" />
            </div>
            <FieldContent>
              <Skeleton className="size-16 rounded-lg" />
            </FieldContent>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Skeleton className="h-8 w-28 rounded-lg" />
      </CardFooter>
    </Card>
  )
}

function AuthenticationCardSkeleton() {
  return (
    <Card>
      <SettingsCardHeaderSkeleton descriptionWidth="w-40" titleWidth="w-28" />
      <CardContent>
        <div>
          {[0, 1].map((index) => (
            <div className={rowClassName} key={index}>
              <Skeleton className="size-4 rounded" />
              <TextSkeleton className="w-14" />
              <TextSkeleton className="w-28" />
              {index === 1 ? (
                <Skeleton className="ml-auto size-6 rounded-md" />
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function InstallationsCardSkeleton() {
  return (
    <Card>
      <SettingsCardHeaderSkeleton descriptionWidth="w-72" titleWidth="w-24" />
      <CardContent>
        <div>
          {[0, 1, 2].map((index) => (
            <div className={rowClassName} key={index}>
              <Skeleton className="size-6 rounded" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="ml-auto h-6 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Skeleton className="h-7 w-48 rounded-lg" />
      </CardFooter>
    </Card>
  )
}

function TextSkeleton({ className }: { className: string }) {
  return (
    <span className="flex h-5 items-center">
      <Skeleton className={`h-4 ${className}`} />
    </span>
  )
}
