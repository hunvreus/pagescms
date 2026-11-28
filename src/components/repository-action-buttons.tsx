import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { repositoryRequest } from '#/lib/repository-identity'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/pending-writes/use-operation'
import { useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Play from '@hugeicons/core-free-icons/PlayIcon'

import { runAction } from '#/client/api/actions'

import type { RepositoryAction } from '#/lib/actions'
import { actionsQueryOptions } from '#/client/queries/repository'

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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from './ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

type ActionValue = string | number | boolean

export function RepositoryActionButtons({
  actions,
  coordinates,
  context,
  disabled = false,
  layout = 'header',
  renderMenu,
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
  layout?: 'header' | 'sidebar' | 'inline'
  renderMenu?: (props: {
    items: ReactNode
    triggerRef: RefObject<HTMLButtonElement | null>
    onCloseAutoFocus: (event: Event) => void
    busy: boolean
  }) => ReactNode
}) {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

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
  const mobileTrigger = useRef<HTMLButtonElement | null>(null)
  const mobileAction = useRef<RepositoryAction | null>(null)
  const dispatching = useRef(false)

  async function dispatch(action: RepositoryAction, inputs = values) {
    if (disabled || running || dispatching.current) return
    dispatching.current = true
    setActiveAction(action.name)
    try {
      await operation.run({
        run: () =>
          runAction({
            ...repositoryRequest(coordinates),
            actionName: action.name,
            inputs,
            context,
          }),
        failureMessage: _t({ message: 'Could not run action.' }),
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
    } catch {
      // The operation boundary reports this failure.
    } finally {
      dispatching.current = false
      setActiveAction(null)
    }
  }

  function choose(action: RepositoryAction, element: HTMLElement) {
    if (disabled || running || dispatching.current) return
    trigger.current = element
    setValues({})
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
    confirmation?.title ??
    (selected ? _t({ message: `Run ${selected.label}?` }) : '')
  const message =
    confirmation?.message ??
    remainingT({ message: 'This will start a GitHub Actions workflow.' })
  const button = confirmation?.button ?? selected?.label

  function closeMenu(event: Event) {
    const action = mobileAction.current
    mobileAction.current = null
    if (action && mobileTrigger.current) {
      event.preventDefault()
      choose(action, mobileTrigger.current)
    }
  }

  const menuItems = actions.length
    ? actions.map((action) => (
        <DropdownMenuItem
          disabled={disabled || running}
          key={action.name}
          onSelect={() => {
            mobileAction.current = action
          }}
        >
          <HugeiconsIcon aria-hidden="true" icon={Play} />
          {action.label}
        </DropdownMenuItem>
      ))
    : null

  if (!actions.length && !renderMenu) return null
  return (
    <div
      className={
        layout === 'sidebar'
          ? 'relative'
          : layout === 'inline'
            ? 'contents'
            : 'relative flex items-center justify-end gap-2 md:flex-wrap'
      }
    >
      {layout === 'header' && !renderMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={mobileTrigger}
              aria-label={_t({ message: 'Run action' })}
              aria-busy={running}
              className="md:hidden"
              disabled={disabled || running}
              size="icon"
              variant="outline"
            >
              {running ? (
                <Spinner aria-hidden="true" />
              ) : (
                <HugeiconsIcon aria-hidden="true" icon={Play} />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-max min-w-32 max-w-[calc(100vw-2rem)]"
            onCloseAutoFocus={closeMenu}
          >
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {layout === 'sidebar' ? (
        <SidebarMenu>
          {actions.map((action) => (
            <SidebarMenuItem key={action.name}>
              <SidebarMenuButton
                aria-busy={running && activeAction === action.name}
                disabled={disabled || running}
                onClick={(event) => choose(action, event.currentTarget)}
              >
                <HugeiconsIcon aria-hidden="true" icon={Play} />
                <span className="truncate">{action.label}</span>
                {running && activeAction === action.name ? (
                  <Spinner aria-hidden="true" />
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      ) : (
        actions.map((action) => {
          const control = (
            <Button
              aria-busy={running && activeAction === action.name}
              disabled={disabled || running}
              key={action.name}
              size={layout === 'inline' ? 'sm' : 'default'}
              type="button"
              variant="outline"
              className={
                layout === 'inline' ? 'max-w-full' : 'hidden md:inline-flex'
              }
              aria-label={
                layout === 'inline'
                  ? _t({ message: `Run ${action.label}` })
                  : undefined
              }
              onClick={(event) => choose(action, event.currentTarget)}
            >
              {layout === 'header' ? (
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Play}
                  data-icon="inline-start"
                />
              ) : null}
              <span className="min-w-0 truncate">{action.label}</span>
              {running && activeAction === action.name ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : layout === 'inline' ? (
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Play}
                  data-icon="inline-end"
                  className="text-muted-foreground transition-colors group-hover/button:text-foreground group-focus-visible/button:text-foreground"
                />
              ) : null}
            </Button>
          )
          return layout === 'inline' ? (
            <Tooltip key={action.name}>
              <TooltipTrigger asChild>{control}</TooltipTrigger>
              <TooltipContent>
                <UiTrans>Run {action.label}</UiTrans>
              </TooltipContent>
            </Tooltip>
          ) : (
            control
          )
        })
      )}
      {renderMenu?.({
        items: menuItems,
        triggerRef: mobileTrigger,
        onCloseAutoFocus: closeMenu,
        busy: running,
      })}
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
                            <SelectValue
                              placeholder={_t({ message: 'Select…' })}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {field.options?.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
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
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => close(false)}
                >
                  {running
                    ? _t({ message: 'Close' })
                    : _t({ message: 'Cancel' })}
                </Button>
                <Button
                  aria-busy={running}
                  disabled={disabled || running}
                  type="submit"
                >
                  {button}
                  {running ? (
                    <Spinner aria-hidden="true" data-icon="inline-end" />
                  ) : null}
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
            <AlertDialogFooter>
              <AlertDialogCancel>
                {running ? _t({ message: 'Close' }) : _t({ message: 'Cancel' })}
              </AlertDialogCancel>
              <AlertDialogAction
                aria-busy={running}
                disabled={disabled || running}
                onClick={(event) => {
                  event.preventDefault()
                  void dispatch(selected)
                }}
              >
                {button}
                {running ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : null}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
