import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Play, X } from 'lucide-react'

import { runAction } from '#/functions/actions'
import { OperationError } from '#/components/operation-error'

import type { RepositoryAction } from '#/lib/actions'
import { actionsQueryOptions } from '#/queries/repository'

import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

type ActionValue = string | number | boolean

export function RepositoryActionButtons({
  actions,
  coordinates,
  context,
}: {
  actions: RepositoryAction[]
  coordinates: { owner: string; repo: string; branch: string }
  context: {
    type: 'collection' | 'entry' | 'file' | 'media'
    name: string
    path: string
    data: Record<string, unknown>
  }
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<RepositoryAction | null>(null)
  const [values, setValues] = useState<Partial<Record<string, ActionValue>>>({})
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function dispatch(action: RepositoryAction) {
    const confirmation = action.confirm
    if (confirmation !== false && !action.fields?.length) {
      const prompt =
        typeof confirmation === 'object' && confirmation.message
          ? confirmation.message
          : `Run ${action.label}?`
      if (!window.confirm(prompt)) return
    }
    setRunning(true)
    setMessage(null)
    setError(null)
    try {
      await runAction({
        data: {
          ...coordinates,
          actionName: action.name,
          inputs: values,
          context,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: actionsQueryOptions(coordinates).queryKey,
      })
      setSelected(null)
      setValues({})
      setMessage(`${action.label} started`)
    } catch (cause) {
      setError(cause)
    } finally {
      setRunning(false)
    }
  }

  function choose(action: RepositoryAction) {
    if (!action.fields?.length) {
      void dispatch(action)
      return
    }
    setValues({})
    setMessage(null)
    setError(null)
    setSelected(action)
  }

  if (!actions.length) return null
  return (
    <div className="relative flex flex-wrap items-center justify-end gap-2">
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
      <OperationError error={error} fallback="Could not run action." />
      {actions.map((action) => (
        <Button
          disabled={running}
          key={action.name}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => choose(action)}
        >
          {running && selected?.name === action.name ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Play />
          )}
          {action.label}
        </Button>
      ))}
      {selected ? (
        <form
          className="absolute right-0 top-full z-20 mt-2 w-80 space-y-4 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
          onSubmit={(event) => {
            event.preventDefault()
            void dispatch(selected)
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{selected.label}</h2>
            <Button
              aria-label="Close action form"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setSelected(null)}
            >
              <X />
            </Button>
          </div>
          {selected.fields?.map((field) => {
            const value =
              values[field.name] ??
              field.default ??
              (field.type === 'checkbox' ? false : '')
            const update = (next: ActionValue | undefined) =>
              setValues((current) => {
                const result = { ...current }
                if (next === undefined) delete result[field.name]
                else result[field.name] = next
                return result
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
          <Button disabled={running} type="submit">
            {running ? <LoaderCircle className="animate-spin" /> : <Play />}
            {running ? 'Starting' : selected.label}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
