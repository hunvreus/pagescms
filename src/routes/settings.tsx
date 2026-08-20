import { useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  Mail,
  Save,
  Unplug,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { GitHubIcon } from '#/components/github-icon'
import { Input } from '#/components/ui/input'
import { OperationError } from '#/components/operation-error'
import { getAccountSettings, updateProfile } from '#/functions/account'
import { authClient, signIn } from '#/lib/auth-client'

export const Route = createFileRoute('/settings')({
  loader: async () => {
    try {
      return await getAccountSettings()
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
  staleTime: 15_000,
  pendingMs: 100,
  component: SettingsPage,
})

function SettingsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState(data.user.name)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function save() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await updateProfile({ data: { name } })
      setMessage('Profile updated')
      await router.invalidate()
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
    if (!window.confirm('Disconnect your GitHub account from Pages CMS?')) {
      return
    }
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
      await router.invalidate()
    } catch (cause) {
      setError(cause)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
      <Button asChild size="sm" variant="outline">
        <Link to="/">
          <ArrowLeft /> Home
        </Link>
      </Button>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>
      {message ? (
        <div className="rounded-lg border bg-card p-3 text-sm">{message}</div>
      ) : null}
      <OperationError error={error} fallback="Could not update settings." />
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
        <div>
          <h2 className="font-semibold">Profile</h2>
          <p className="text-sm text-muted-foreground">
            Information displayed to collaborators.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="block space-y-2">
            <span className="text-sm font-medium">Name</span>
            <Input
              maxLength={120}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            disabled={saving || name.trim() === data.user.name.trim()}
            type="submit"
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? 'Saving' : 'Save profile'}
          </Button>
        </form>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
        <div>
          <h2 className="font-semibold">Authentication</h2>
          <p className="text-sm text-muted-foreground">
            Linked sign-in methods.
          </p>
        </div>
        <ul className="overflow-hidden rounded-lg border text-sm">
          <li className="flex items-center gap-3 border-b px-3 py-3">
            <Mail className="size-4" />
            <span className="font-medium">Email</span>
            <span className="ml-auto truncate text-muted-foreground">
              {data.user.email}
            </span>
          </li>
          <li className="flex items-center gap-3 px-3 py-3">
            <GitHubIcon />
            <span className="font-medium">GitHub</span>
            {data.githubConnected ? (
              <>
                <span className="ml-auto text-muted-foreground">
                  {data.user.githubUsername
                    ? `@${data.user.githubUsername}`
                    : 'Connected'}
                </span>
                {data.githubManageUrl ? (
                  <Button
                    asChild
                    aria-label="Manage GitHub connection"
                    size="icon"
                    variant="outline"
                  >
                    <a
                      href={data.githubManageUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink />
                    </a>
                  </Button>
                ) : null}
                <Button
                  aria-label="Disconnect GitHub"
                  disabled={disconnecting}
                  size="icon"
                  variant="outline"
                  onClick={() => void disconnectGithub()}
                >
                  {disconnecting ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Unplug />
                  )}
                </Button>
              </>
            ) : data.githubAvailable ? (
              <Button
                className="ml-auto"
                disabled={connecting}
                size="sm"
                variant="outline"
                onClick={() => void connectGithub()}
              >
                {connecting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <GitHubIcon />
                )}
                Connect
              </Button>
            ) : (
              <span className="ml-auto text-muted-foreground">Unavailable</span>
            )}
          </li>
        </ul>
      </section>
      {data.githubConnected ? (
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
          <div>
            <h2 className="font-semibold">Installations</h2>
            <p className="text-sm text-muted-foreground">
              GitHub App accounts available to Pages CMS.
            </p>
          </div>
          {data.githubAppInstallAvailable ? (
            <Button asChild variant="outline">
              <a href="/api/github-app/install">
                Install on another account <ExternalLink />
              </a>
            </Button>
          ) : null}
          {data.accounts.length ? (
            <ul className="overflow-hidden rounded-lg border">
              {data.accounts.map((account) => {
                const url =
                  account.type === 'org'
                    ? `https://github.com/organizations/${encodeURIComponent(account.login)}/settings/installations/${account.installationId}`
                    : `https://github.com/settings/installations/${account.installationId}`
                return (
                  <li
                    className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
                    key={`${account.login}:${account.installationId}`}
                  >
                    <img
                      alt=""
                      className="size-7 rounded"
                      src={`https://github.com/${encodeURIComponent(account.login)}.png?size=56`}
                    />
                    <span className="font-medium">{account.login}</span>
                    <Button
                      asChild
                      className="ml-auto"
                      size="sm"
                      variant="outline"
                    >
                      <a href={url} rel="noreferrer" target="_blank">
                        Manage <ExternalLink />
                      </a>
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No GitHub App installations found.
            </p>
          )}
        </section>
      ) : null}
    </main>
  )
}
