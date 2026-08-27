import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Database, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { Skeleton } from '#/components/ui/skeleton'
import { updateCache } from '#/functions/cache'
import { getSignInUrl } from '#/lib/auth-redirect'
import { queryKeys } from '#/queries/keys'
import { cacheStatusQueryOptions } from '#/queries/repository'

type CacheAction =
  | 'reconcile-content'
  | 'clear-content'
  | 'clear-permissions'
  | 'refresh-configuration'
  | 'clear-configuration'
  | 'clear-all'

export const Route = createFileRoute('/$owner/$repo/$branch/cache')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(cacheStatusQueryOptions(params))
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
  pendingMs: 100,
  pendingComponent: CacheSkeleton,
  component: CachePage,
})

function CachePage() {
  const params = Route.useParams()
  const { data } = useSuspenseQuery(cacheStatusQueryOptions(params))
  const queryClient = useQueryClient()
  const [running, setRunning] = useState<CacheAction | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function run(action: CacheAction, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return
    setRunning(action)
    setMessage(null)
    setError(null)
    try {
      const result = await updateCache({ data: { ...params, action } })
      setMessage(result.message)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <RepositoryPageTitle description={params.branch}>
          Cache
        </RepositoryPageTitle>
      </RepositoryPageHeader>
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">
          Durable private repository snapshots. GitHub remains authoritative.
        </p>
        {message ? (
          <div className="rounded-lg border bg-card p-3 text-sm">{message}</div>
        ) : null}
        <OperationError error={error} fallback="Could not update the cache." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Cached files" value={data.fileCount} />
          <Metric label="Cached directories" value={data.directories.length} />
          <Metric label="Permission records" value={data.permissionCount} />
        </div>
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
          <div>
            <h2 className="font-semibold">Content cache</h2>
            <p className="text-sm text-muted-foreground">
              Collection and media folders are cached in PostgreSQL and
              refreshed when their freshness window expires.
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
    <div className="-m-4 md:-m-6" aria-label="Loading cache status">
      <RepositoryPageHeader>
        <Skeleton className="h-5 w-24" />
      </RepositoryPageHeader>
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
