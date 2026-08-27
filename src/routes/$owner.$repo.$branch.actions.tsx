import { useEffect, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ExternalLink, LoaderCircle, Play, RotateCcw, X } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { Skeleton } from '#/components/ui/skeleton'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { manageAction, runAction } from '#/functions/actions'
import { getSignInUrl } from '#/lib/auth-redirect'
import { actionsQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/actions')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(actionsQueryOptions(params))
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/actions`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: ActionsSkeleton,
  component: ActionsPage,
})

function ActionsPage() {
  const params = Route.useParams()
  const { data } = useSuspenseQuery(actionsQueryOptions(params))
  const queryClient = useQueryClient()
  const [values, setValues] = useState<
    Partial<Record<string, Record<string, string | number | boolean>>>
  >({})
  const [running, setRunning] = useState<string | null>(null)
  const [managing, setManaging] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)

  const hasActiveRuns = data.runs.some(
    (actionRun) => actionRun.status !== 'completed',
  )
  useEffect(() => {
    if (!hasActiveRuns) return
    let cancelled = false
    let timer = window.setTimeout(refresh, 4_000)
    async function refresh() {
      await queryClient.invalidateQueries({
        queryKey: actionsQueryOptions(params).queryKey,
      })
      if (!cancelled) timer = window.setTimeout(refresh, 4_000)
    }
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [hasActiveRuns, params, queryClient])

  async function run(action: (typeof data.actions)[number]) {
    const confirm = action.confirm
    if (confirm !== false && !action.fields?.length) {
      const message =
        typeof confirm === 'object' && confirm.message
          ? confirm.message
          : 'Trigger this GitHub Action?'
      if (!window.confirm(message)) return
    }
    setRunning(action.name)
    setError(null)
    try {
      await runAction({
        data: {
          ...params,
          actionName: action.name,
          inputs: values[action.name] ?? {},
        },
      })
      await queryClient.invalidateQueries({
        queryKey: actionsQueryOptions(params).queryKey,
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setRunning(null)
    }
  }

  async function manage(runId: number, intent: 'cancel' | 'rerun') {
    if (intent === 'cancel' && !window.confirm('Cancel this action run?'))
      return
    setManaging(runId)
    setError(null)
    try {
      await manageAction({ data: { ...params, runId, intent } })
      await queryClient.invalidateQueries({
        queryKey: actionsQueryOptions(params).queryKey,
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setManaging(null)
    }
  }

  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <RepositoryPageTitle description={params.branch}>
          Actions
        </RepositoryPageTitle>
      </RepositoryPageHeader>
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <OperationError error={error} fallback="Could not update the action." />
        <div className="grid gap-4 md:grid-cols-2">
          {data.actions.map((action) => (
            <section
              className="space-y-4 rounded-xl border bg-card p-5 shadow-xs"
              key={action.name}
            >
              <h2 className="font-semibold">{action.label}</h2>
              {action.fields?.map((field) => {
                const value =
                  values[action.name]?.[field.name] ??
                  field.default ??
                  (field.type === 'checkbox' ? false : '')
                const update = (next: string | number | boolean | undefined) =>
                  setValues((current) => {
                    const actionValues = { ...current[action.name] }
                    if (next === undefined) delete actionValues[field.name]
                    else actionValues[field.name] = next
                    return { ...current, [action.name]: actionValues }
                  })
                return (
                  <label className="block space-y-2" key={field.name}>
                    <span className="text-sm font-medium">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </span>
                    {field.type === 'textarea' ? (
                      <Textarea
                        value={String(value)}
                        onChange={(event) => update(event.target.value)}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                        required={field.required}
                        value={String(value)}
                        onChange={(event) => update(event.target.value)}
                      >
                        <option value="">Select…</option>
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'checkbox' ? (
                      <input
                        checked={value === true}
                        className="size-4"
                        type="checkbox"
                        onChange={(event) => update(event.target.checked)}
                      />
                    ) : (
                      <Input
                        required={field.required}
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={
                          typeof value === 'string' || typeof value === 'number'
                            ? value
                            : ''
                        }
                        onChange={(event) =>
                          update(
                            field.type === 'number'
                              ? event.target.value === ''
                                ? undefined
                                : event.target.valueAsNumber
                              : event.target.value,
                          )
                        }
                      />
                    )}
                  </label>
                )
              })}
              <Button
                disabled={running === action.name}
                onClick={() => void run(action)}
              >
                {running === action.name ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Play />
                )}
                {running === action.name ? 'Starting' : action.label}
              </Button>
            </section>
          ))}
        </div>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent runs</h2>
          {data.runs.length ? (
            <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
              {data.runs.map((actionRun) => (
                <li
                  className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  key={actionRun.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {data.actions.find(
                        (action) => action.name === actionRun.actionName,
                      )?.label ?? actionRun.actionName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {actionRun.conclusion ?? actionRun.status} ·{' '}
                      {actionRun.triggeredBy.name} ·{' '}
                      {new Date(actionRun.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {actionRun.htmlUrl ? (
                    <Button asChild size="icon" variant="outline">
                      <a
                        href={actionRun.htmlUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                  {actionRun.canCancel ? (
                    <Button
                      aria-label="Cancel action run"
                      disabled={managing === actionRun.id}
                      size="icon"
                      variant="outline"
                      onClick={() => void manage(actionRun.id, 'cancel')}
                    >
                      {managing === actionRun.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <X />
                      )}
                    </Button>
                  ) : null}
                  {actionRun.canRerun && actionRun.status === 'completed' ? (
                    <Button
                      aria-label="Run action again"
                      disabled={managing === actionRun.id}
                      size="icon"
                      variant="outline"
                      onClick={() => void manage(actionRun.id, 'rerun')}
                    >
                      {managing === actionRun.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <RotateCcw />
                      )}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No action runs yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function ActionsSkeleton() {
  return (
    <div aria-label="Loading actions" className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <Skeleton className="h-5 w-24" />
      </RepositoryPageHeader>
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              className="h-48 rounded-xl border bg-card"
              key={`action-skeleton-${index}`}
            />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-36 rounded-xl border bg-card" />
        </div>
      </div>
    </div>
  )
}
