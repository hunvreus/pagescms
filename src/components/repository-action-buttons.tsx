import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/operations/use-operation'
import { useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Play } from 'lucide-react'

import { runAction } from '#/functions/actions'
import { OperationError } from '#/components/operation-error'

import type { RepositoryAction } from '#/lib/actions'
import { actionsQueryOptions } from '#/queries/repository'

import { Button } from './ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Checkbox } from './ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from './ui/sidebar'

type ActionValue = string | number | boolean

export function RepositoryActionButtons({
  actions,
  coordinates,
  context,
  disabled = false,
  layout = 'header',
}: {
  actions: RepositoryAction[]
  coordinates: { owner: string; repo: string; branch: string }
  context: {
    type: 'repository' | 'collection' | 'entry' | 'file' | 'media'
    name: string | null
    path: string | null
    data: Record<string, unknown>
  }
  disabled?: boolean
  layout?: 'header' | 'sidebar'
}) {
  const fieldPrefix = useId()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<RepositoryAction | null>(null)
  const [values, setValues] = useState<Partial<Record<string, ActionValue>>>({})
  const operation = useOperation<Awaited<ReturnType<typeof runAction>>>(
    operationKey('workflow-dispatch', coordinates),
  )
  const running = operation.pending
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const dispatching = useRef(false)
  const [error, setError] = useState<unknown>(null)

  async function dispatch(action: RepositoryAction, inputs = values) {
    if (disabled || running || dispatching.current) return
    dispatching.current = true
    setActiveAction(action.name)
    setError(null)
    try {
      await operation.run({
        run: () =>
          runAction({
            data: { ...coordinates, actionName: action.name, inputs, context },
          }),
        failureMessage: 'Could not run action.',
        confirmed: async (run, active) => {
          if (!active()) return
          const { actionRunTracking } =
            await import('#/lib/action-run-tracking')
          if (!active()) return
          actionRunTracking(queryClient).track(coordinates, run, action.label)
          refreshQueries(queryClient, [
            actionsQueryOptions(coordinates).queryKey,
          ])
        },
      })
      setSelected(null)
      setValues({})
    } catch (cause) {
      setError(cause)
    } finally {
      dispatching.current = false
      setActiveAction(null)
    }
  }

  function choose(action: RepositoryAction, element: HTMLElement) {
    if (disabled || running || dispatching.current) return
    trigger.current = element
    setValues({})
    setError(null)
    if (action.confirm === false && !action.fields?.length) {
      void dispatch(action, {})
      return
    }
    setSelected(action)
  }

  function close(open: boolean) {
    if (!open) {
      setSelected(null)
      setValues({})
      setError(null)
    }
  }

  function restoreFocus(event: Event) {
    event.preventDefault()
    trigger.current?.focus()
  }

  const confirmation =
    selected && typeof selected.confirm === 'object'
      ? selected.confirm
      : undefined
  const title =
    confirmation?.title ?? (selected ? `Run ${selected.label}?` : '')
  const message =
    confirmation?.message ?? 'This will start a GitHub Actions workflow.'
  const button = confirmation?.button ?? selected?.label

  if (!actions.length) return null
  return (
    <div
      className={
        layout === 'sidebar'
          ? 'relative'
          : 'relative flex flex-wrap items-center justify-end gap-2'
      }
    >
      {!selected ? (
        <OperationError
          error={error ?? operation.error}
          fallback="Could not run action."
        />
      ) : null}
      {layout === 'sidebar' ? (
        <SidebarMenu>
          {actions.map((action) => (
            <SidebarMenuItem key={action.name}>
              <SidebarMenuButton
                disabled={disabled || running}
                onClick={(event) => choose(action, event.currentTarget)}
              >
                {running && activeAction === action.name ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Play />
                )}
                <span>{action.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      ) : (
        actions.map((action) => (
          <Button
            disabled={disabled || running}
            key={action.name}
            size="default"
            type="button"
            variant="outline"
            onClick={(event) => choose(action, event.currentTarget)}
          >
            {running && activeAction === action.name ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Play />
            )}
            {action.label}
          </Button>
        ))
      )}
      {selected?.fields?.length ? (
        <Dialog open onOpenChange={close}>
          <DialogContent
            showCloseButton={!running}
            onCloseAutoFocus={restoreFocus}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{message}</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void dispatch(selected)
              }}
            >
              <FieldGroup className="max-h-[60vh] overflow-y-auto">
                {selected.fields.map((field) => {
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
                  const id = `${fieldPrefix}-${field.name}`
                  const label = (
                    <FieldLabel htmlFor={id}>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </FieldLabel>
                  )
                  return (
                    <Field
                      key={field.name}
                      orientation={
                        field.type === 'checkbox' ? 'horizontal' : 'vertical'
                      }
                      data-disabled={running}
                    >
                      {field.type !== 'checkbox' ? label : null}
                      {field.type === 'textarea' ? (
                        <Textarea
                          id={id}
                          disabled={running}
                          required={field.required}
                          value={String(value)}
                          onChange={(event) => update(event.target.value)}
                        />
                      ) : field.type === 'select' ? (
                        <Select
                          name={field.name}
                          disabled={running}
                          required={field.required}
                          value={String(value)}
                          onValueChange={update}
                        >
                          <SelectTrigger id={id} className="w-full">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : field.type === 'checkbox' ? (
                        <Checkbox
                          id={id}
                          disabled={running}
                          checked={value === true}
                          onCheckedChange={(checked) =>
                            update(checked === true)
                          }
                        />
                      ) : (
                        <Input
                          id={id}
                          disabled={running}
                          required={field.required}
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={
                            typeof value === 'string' ||
                            typeof value === 'number'
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
                      {field.type === 'checkbox' ? label : null}
                    </Field>
                  )
                })}
              </FieldGroup>
              <OperationError
                error={error ?? operation.error}
                fallback="Could not run action."
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => close(false)}
                >
                  {running ? 'Close' : 'Cancel'}
                </Button>
                <Button disabled={disabled || running} type="submit">
                  {running ? 'Starting' : button}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : selected ? (
        <AlertDialog open onOpenChange={close}>
          <AlertDialogContent onCloseAutoFocus={restoreFocus}>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{message}</AlertDialogDescription>
            </AlertDialogHeader>
            <OperationError
              error={error ?? operation.error}
              fallback="Could not run action."
            />
            <AlertDialogFooter>
              <AlertDialogCancel>
                {running ? 'Close' : 'Cancel'}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={disabled || running}
                onClick={(event) => {
                  event.preventDefault()
                  void dispatch(selected)
                }}
              >
                {running ? 'Starting' : button}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
