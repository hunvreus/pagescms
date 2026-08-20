import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { ExternalLink, LoaderCircle, Play } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { getActions, runAction } from '#/functions/actions'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute('/$owner/$repo/$branch/actions')({
  loader: async ({ params }) => {
    try {
      return await getActions({ data: params })
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
  staleTime: 5_000,
  pendingMs: 100,
  component: ActionsPage,
})

function ActionsPage() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
  const [values, setValues] = useState<
    Partial<Record<string, Record<string, string | number | boolean>>>
  >({})
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      await router.invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run action')
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{params.branch}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Actions</h1>
      </header>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
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
              const update = (next: string | number | boolean) =>
                setValues((current) => ({
                  ...current,
                  [action.name]: {
                    ...current[action.name],
                    [field.name]: next,
                  },
                }))
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
                            ? event.target.valueAsNumber
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
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No action runs yet.</p>
        )}
      </section>
    </div>
  )
}
