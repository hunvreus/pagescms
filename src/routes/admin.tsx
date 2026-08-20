import { useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import {
  ArrowLeft,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { getAdminDashboard, runAdminAction } from '#/functions/admin'

interface AdminSearch {
  query?: string
  page?: number
}

export const Route = createFileRoute('/admin')({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    query:
      typeof search.query === 'string' && search.query
        ? search.query
        : undefined,
    page:
      typeof search.page === 'number' &&
      Number.isInteger(search.page) &&
      search.page > 1
        ? search.page
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    query: search.query ?? '',
    page: search.page ?? 1,
  }),
  loader: async ({ deps }) => {
    try {
      return await getAdminDashboard({ data: deps })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({ href: '/sign-in?redirect=%2Fadmin' })
      }
      throw error
    }
  },
  staleTime: 5_000,
  pendingMs: 100,
  component: AdminPage,
})

function AdminPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [query, setQuery] = useState(data.query)
  const [running, setRunning] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function run(
    action: 'revoke-user' | 'revoke-all' | 'reset-cache',
    userId?: string,
  ) {
    const prompt =
      action === 'revoke-all'
        ? 'Log out every user, including you?'
        : action === 'reset-cache'
          ? 'Clear every cached file, configuration, and permission record?'
          : 'Revoke all sessions for this user?'
    if (!window.confirm(prompt)) return
    const key = userId ?? action
    setRunning(key)
    setMessage(null)
    try {
      const result = await runAdminAction({ data: { action, userId } })
      if (result.signedOut) {
        window.location.assign('/sign-in')
        return
      }
      setMessage(result.message)
      await router.invalidate()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Admin action failed')
    } finally {
      setRunning(null)
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <Button asChild size="sm" variant="outline">
        <Link to="/">
          <ArrowLeft /> Home
        </Link>
      </Button>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      </header>
      {message ? (
        <div className="rounded-lg border bg-card p-3 text-sm">{message}</div>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Users" value={data.metrics.users} />
        <Metric label="Installations" value={data.metrics.installations} />
        <Metric label="Configured repos" value={data.metrics.repositories} />
        <Metric label="Cached files" value={data.metrics.cachedFiles} />
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Users</h2>
            <p className="text-sm text-muted-foreground">
              {data.matchingUsers} matching accounts
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void router.navigate({
                  to: '/admin',
                  search: { query: query.trim() || undefined },
                })
              }}
            >
              <Input
                aria-label="Search users"
                placeholder="Search users"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button
                aria-label="Search"
                size="icon"
                type="submit"
                variant="outline"
              >
                <Search />
              </Button>
            </form>
            <Button
              disabled={running !== null}
              variant="outline"
              onClick={() => void run('revoke-all')}
            >
              {running === 'revoke-all' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LogOut />
              )}
              Log out all
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">GitHub</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td className="max-w-48 truncate px-3 py-2 font-medium">
                    {user.name}
                  </td>
                  <td className="max-w-64 truncate px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {user.githubUsername ? `@${user.githubUsername}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      aria-label={`Log out ${user.name}`}
                      disabled={running !== null}
                      size="icon"
                      variant="ghost"
                      onClick={() => void run('revoke-user', user.id)}
                    >
                      {running === user.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <LogOut />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button asChild disabled={data.page <= 1} size="sm" variant="outline">
            <Link
              aria-disabled={data.page <= 1}
              className={data.page <= 1 ? 'pointer-events-none opacity-50' : ''}
              search={{
                query: data.query || undefined,
                page: data.page > 2 ? data.page - 1 : undefined,
              }}
              to="/admin"
            >
              Previous
            </Link>
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <Button
            asChild
            disabled={data.page >= data.pages}
            size="sm"
            variant="outline"
          >
            <Link
              aria-disabled={data.page >= data.pages}
              className={
                data.page >= data.pages ? 'pointer-events-none opacity-50' : ''
              }
              search={{ query: data.query || undefined, page: data.page + 1 }}
              to="/admin"
            >
              Next
            </Link>
          </Button>
        </div>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-xs">
        <div>
          <h2 className="font-semibold">Global cache</h2>
          <p className="text-sm text-muted-foreground">
            {data.metrics.cacheMetadata} directory snapshots ·{' '}
            {data.metrics.cachedPermissions} permission records ·{' '}
            {data.metrics.collaborators} collaborators
          </p>
        </div>
        <Button
          disabled={running !== null}
          variant="outline"
          onClick={() => void run('reset-cache')}
        >
          {running === 'reset-cache' ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
          Reset cache
        </Button>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <p className="text-3xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
