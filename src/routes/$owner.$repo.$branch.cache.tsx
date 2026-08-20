import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Database, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { getCacheStatus, updateCache } from '#/functions/cache'
import { getSignInUrl } from '#/lib/auth-redirect'

type CacheAction =
  | 'reconcile-content'
  | 'clear-content'
  | 'clear-permissions'
  | 'refresh-configuration'
  | 'clear-configuration'
  | 'clear-all'

export const Route = createFileRoute('/$owner/$repo/$branch/cache')({
  loader: async ({ params }) => {
    try {
      return await getCacheStatus({ data: params })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/cache`,
          ),
        })
      }
      throw error
    }
  },
  staleTime: 10_000,
  pendingMs: 100,
  pendingComponent: CacheSkeleton,
  component: CachePage,
})

function CachePage() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
  const [running, setRunning] = useState<CacheAction | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: CacheAction, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return
    setRunning(action)
    setMessage(null)
    setError(null)
    try {
      const result = await updateCache({ data: { ...params, action } })
      setMessage(result.message)
      await router.invalidate()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update cache',
      )
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{params.branch}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Cache</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Durable private repository snapshots. GitHub remains authoritative.
        </p>
      </header>
      {message ? (
        <div className="rounded-lg border bg-card p-3 text-sm">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Cached files" value={data.fileCount} />
        <Metric label="Cached directories" value={data.directories.length} />
        <Metric label="Permission records" value={data.permissionCount} />
      </div>
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
        <div>
          <h2 className="font-semibold">Content cache</h2>
          <p className="text-sm text-muted-foreground">
            Collection and media folders use stale-while-revalidate snapshots.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            action="reconcile-content"
            current={running}
            label="Reconcile now"
            onRun={run}
          />
          <ActionButton
            destructive
            action="clear-content"
            confirmation="Clear cached collection and media data?"
            current={running}
            label="Clear content cache"
            onRun={run}
          />
        </div>
        {data.directories.length ? (
          <ul className="divide-y rounded-lg border">
            {data.directories.map((directory) => (
              <li
                className="flex justify-between gap-4 px-3 py-2 text-sm"
                key={`${directory.context}:${directory.path}`}
              >
                <span className="truncate">{directory.path || '/'}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {directory.context} ·{' '}
                  {new Date(directory.lastCheckedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
        <div>
          <h2 className="font-semibold">Configuration cache</h2>
          <p className="text-sm text-muted-foreground">
            {data.configuration
              ? `${data.configuration.sha.slice(0, 8)} · checked ${new Date(data.configuration.lastCheckedAt).toLocaleString()}`
              : 'No configuration snapshot.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            action="refresh-configuration"
            current={running}
            label="Refresh configuration"
            onRun={run}
          />
          <ActionButton
            destructive
            action="clear-configuration"
            confirmation="Clear the configuration snapshot?"
            current={running}
            label="Clear configuration"
            onRun={run}
          />
          <ActionButton
            destructive
            action="clear-permissions"
            confirmation="Clear cached repository permission checks?"
            current={running}
            label="Clear permissions"
            onRun={run}
          />
        </div>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <div>
          <h2 className="font-semibold">Clear everything</h2>
          <p className="text-sm text-muted-foreground">
            The next request will repopulate required snapshots from GitHub.
          </p>
        </div>
        <ActionButton
          destructive
          action="clear-all"
          confirmation="Clear all cache data for this repository and branch?"
          current={running}
          label="Clear all caches"
          onRun={run}
        />
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <Database className="mb-3 size-5 text-muted-foreground" />
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function ActionButton({
  action,
  label,
  current,
  confirmation,
  destructive = false,
  onRun,
}: {
  action: CacheAction
  label: string
  current: CacheAction | null
  confirmation?: string
  destructive?: boolean
  onRun: (action: CacheAction, confirmation?: string) => Promise<void>
}) {
  const active = current === action
  return (
    <Button
      disabled={current !== null}
      variant={destructive ? 'destructive' : 'outline'}
      onClick={() => void onRun(action, confirmation)}
    >
      {active ? (
        <LoaderCircle className="animate-spin" />
      ) : destructive ? (
        <Trash2 />
      ) : (
        <RefreshCw />
      )}
      {active ? 'Working' : label}
    </Button>
  )
}

function CacheSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse space-y-5"
      aria-label="Loading cache status"
    >
      <div className="h-8 w-40 rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-28 rounded-xl border bg-card" />
        <div className="h-28 rounded-xl border bg-card" />
        <div className="h-28 rounded-xl border bg-card" />
      </div>
    </div>
  )
}
