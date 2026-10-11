import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { useActionRunTracking } from './use-action-run-tracking'
import { SearchInput } from '#/components/search-input'
import { Fragment, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  LoaderCircle,
  Play,
  RotateCcw,
  EllipsisVertical,
  ChevronDown,
  ArrowUpRight,
} from 'lucide-react'

import { OperationError } from '#/components/operation-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { ActionRunStatus } from './action-run-status'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '#/components/ui/dropdown-menu'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { manageAction, runAction } from '#/functions/actions'
import { actionsQueryOptions } from '#/queries/repository'

import { RepositoryAdminPage } from './repository-admin-page'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'

export function ActionsPage({
  owner,
  repo,
  branch,
  actionName,
  onActionFilter,
}: {
  owner: string
  repo: string
  branch: string
  actionName?: string
  onActionFilter?: (name?: string) => void
}) {
  const params = { owner, repo, branch }
  const { data, isFetching, refetch, dataUpdatedAt } = useSuspenseQuery(
    actionsQueryOptions(params),
  )
  useActionRunTracking(params, data.runs, dataUpdatedAt)
  const canViewGitHub = useRepositoryGitHubLink()
  const [formAction, setFormAction] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [values, setValues] = useState<
    Partial<Record<string, Record<string, string | number | boolean>>>
  >({})
  const [pendingAction, setPendingAction] = useState<
    (typeof data.actions)[number] | null
  >(null)
  const [cancelRun, setCancelRun] = useState<number | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [managing, setManaging] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [search, setSearch] = useState('')
  const filterKey = `${actionName ?? ''}:${search}`
  const [pagination, setPagination] = useState({ filter: filterKey, page: 0 })
  const actionOptions = new Map(
    data.actions.map((action) => [action.name, action.label]),
  )
  for (const run of data.runs) {
    if (!actionOptions.has(run.actionName))
      actionOptions.set(run.actionName, run.actionName)
  }
  if (actionName && !actionOptions.has(actionName))
    actionOptions.set(actionName, actionName)
  const query = search.trim().toLowerCase()
  const runs = data.runs.filter(
    (run) =>
      (!actionName || run.actionName === actionName) &&
      (!query ||
        [
          run.actionName,
          actionOptions.get(run.actionName),
          run.triggeredBy.name,
          run.triggeredBy.email,
          run.conclusion,
          run.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)),
  )
  const pageSize = 10
  const pageCount = Math.ceil(runs.length / pageSize)
  const pageIndex = Math.min(
    pagination.filter === filterKey ? pagination.page : 0,
    Math.max(0, pageCount - 1),
  )
  const visibleRuns = runs.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize,
  )

  async function start(action: (typeof data.actions)[number]) {
    setPendingAction(null)
    setRunning(action.name)
    setError(null)
    try {
      const run = await runAction({
        data: {
          ...params,
          actionName: action.name,
          inputs: values[action.name] ?? {},
        },
      })
      const { actionRunTracking } = await import('#/lib/action-run-tracking')
      actionRunTracking(queryClient).track(params, run, action.label)
      setFormAction(null)
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
    setCancelRun(null)
    setManaging(runId)
    setError(null)
    try {
      const run = await manageAction({ data: { ...params, runId, intent } })
      if (intent === 'rerun') {
        const { actionRunTracking } = await import('#/lib/action-run-tracking')
        actionRunTracking(queryClient).track(
          params,
          run,
          actionOptions.get(run.actionName) ?? run.actionName,
        )
      } else toast.success('Cancellation requested')
      await queryClient.invalidateQueries({
        queryKey: actionsQueryOptions(params).queryKey,
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setManaging(null)
    }
  }

  function update(
    targetName: string,
    fieldName: string,
    value: string | number | boolean | undefined,
  ) {
    setValues((current) => {
      const actionValues = { ...current[targetName] }
      if (value === undefined) delete actionValues[fieldName]
      else actionValues[fieldName] = value
      return { ...current, [targetName]: actionValues }
    })
  }

  return (
    <RepositoryAdminPage
      title="Actions"
      actions={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    aria-label="Refresh action runs"
                    size="icon"
                    variant="ghost"
                    disabled={
                      isFetching || (!data.actions.length && !data.runs.length)
                    }
                    onClick={() =>
                      void refetch().then((result) => setError(result.error))
                    }
                  >
                    <RotateCcw
                      className={isFetching ? 'animate-spin' : undefined}
                    />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Select
            disabled={!actionOptions.size}
            value={actionName ? `action:${actionName}` : 'all'}
            onValueChange={(value) => {
              const action = value === 'all' ? undefined : value.slice(7)
              setPagination({ filter: `${action ?? ''}:${search}`, page: 0 })
              onActionFilter?.(action)
            }}
          >
            <SelectTrigger
              aria-label="Filter runs by action"
              className="w-full sm:w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {[...actionOptions].map(([name, label]) => (
                <SelectItem key={name} value={`action:${name}`}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SearchInput
            disabled={!data.runs.length}
            aria-label="Search action runs"
            placeholder="Search runs…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPagination({
                filter: `${actionName ?? ''}:${event.target.value}`,
                page: 0,
              })
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={!data.actions.length || running !== null}>
                <Play />
                {running ? 'Starting' : 'Run'}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {data.actions.map((action) => (
                <DropdownMenuItem
                  key={action.name}
                  onSelect={() => {
                    if (action.fields?.length) setFormAction(action.name)
                    else if (action.confirm === false) void start(action)
                    else setPendingAction(action)
                  }}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <OperationError error={error} fallback="Could not update the action." />
      {data.actions.map((action) => (
        <Fragment key={action.name}>
          {action.fields?.length ? (
            <Dialog
              open={formAction === action.name}
              onOpenChange={(open) => !open && setFormAction(null)}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{action.label}</DialogTitle>
                  <DialogDescription>
                    Configure inputs before running this workflow.
                  </DialogDescription>
                </DialogHeader>
                <OperationError
                  error={error}
                  fallback="Could not run the action."
                />
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (action.confirm === false) void start(action)
                    else setPendingAction(action)
                  }}
                >
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    {action.fields.map((field) => {
                      const value =
                        values[action.name]?.[field.name] ??
                        field.default ??
                        (field.type === 'checkbox' ? false : '')
                      return (
                        <Field
                          key={field.name}
                          orientation={
                            field.type === 'checkbox'
                              ? 'horizontal'
                              : 'vertical'
                          }
                        >
                          {field.type === 'checkbox' ? (
                            <>
                              <Checkbox
                                checked={value === true}
                                id={`${action.name}-${field.name}`}
                                onCheckedChange={(checked) =>
                                  update(
                                    action.name,
                                    field.name,
                                    checked === true,
                                  )
                                }
                              />
                              <FieldLabel
                                htmlFor={`${action.name}-${field.name}`}
                              >
                                {field.label}
                              </FieldLabel>
                            </>
                          ) : (
                            <>
                              <FieldLabel
                                htmlFor={`${action.name}-${field.name}`}
                              >
                                {field.label}
                                {field.required ? ' *' : ''}
                              </FieldLabel>
                              {field.type === 'textarea' ? (
                                <Textarea
                                  id={`${action.name}-${field.name}`}
                                  required={field.required}
                                  value={String(value)}
                                  onChange={(event) =>
                                    update(
                                      action.name,
                                      field.name,
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : field.type === 'select' ? (
                                <Select
                                  value={String(value)}
                                  onValueChange={(next) =>
                                    update(action.name, field.name, next)
                                  }
                                >
                                  <SelectTrigger
                                    className="w-full"
                                    id={`${action.name}-${field.name}`}
                                  >
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
                              ) : (
                                <Input
                                  id={`${action.name}-${field.name}`}
                                  required={field.required}
                                  type={
                                    field.type === 'number' ? 'number' : 'text'
                                  }
                                  value={
                                    typeof value === 'string' ||
                                    typeof value === 'number'
                                      ? value
                                      : ''
                                  }
                                  onChange={(event) =>
                                    update(
                                      action.name,
                                      field.name,
                                      field.type === 'number'
                                        ? event.target.value === ''
                                          ? undefined
                                          : event.target.valueAsNumber
                                        : event.target.value,
                                    )
                                  }
                                />
                              )}
                            </>
                          )}
                        </Field>
                      )
                    })}
                  </FieldGroup>
                  <div className="flex justify-end">
                    <Button disabled={running !== null} type="submit">
                      Run
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </Fragment>
      ))}
      <section className="space-y-3">
        {data.runs.length === 100 ? (
          <p className="text-sm text-muted-foreground">
            Search and filters apply to the latest 100 runs.
          </p>
        ) : null}
        <Table
          aria-label="Recent action runs"
          containerClassName="rounded-xl border bg-card"
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Triggered by</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRuns.length ? (
              visibleRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <ActionRunStatus
                      status={run.status}
                      conclusion={run.conclusion}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {data.actions.find(
                      (action) => action.name === run.actionName,
                    )?.label ?? run.actionName}
                  </TableCell>
                  <TableCell>
                    {run.triggeredBy.email ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>{run.triggeredBy.name}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {run.triggeredBy.email}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      run.triggeredBy.name
                    )}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <time dateTime={run.createdAt} tabIndex={0}>
                            {formatDistanceToNow(new Date(run.createdAt), {
                              addSuffix: true,
                            })}
                          </time>
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'full',
                            timeStyle: 'long',
                            timeZone: 'UTC',
                          }).format(new Date(run.createdAt))}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="py-0 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {run.canRerun && run.status === 'completed' ? (
                        <Button
                          aria-label="Run action again"
                          disabled={managing === run.id}
                          size="sm"
                          variant="outline"
                          onClick={() => void manage(run.id, 'rerun')}
                        >
                          {managing === run.id ? (
                            <LoaderCircle className="animate-spin" />
                          ) : null}
                          Run again
                        </Button>
                      ) : null}
                      {(canViewGitHub && run.htmlUrl) || run.canCancel ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={`Actions for run ${run.id}`}
                              size="icon-sm"
                              variant="outline"
                              disabled={managing === run.id}
                            >
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44">
                            {canViewGitHub && run.htmlUrl ? (
                              <DropdownMenuItem asChild>
                                <a
                                  href={run.htmlUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                  className="whitespace-nowrap"
                                >
                                  View on GitHub
                                  <ArrowUpRight className="ml-auto opacity-50" />
                                </a>
                              </DropdownMenuItem>
                            ) : null}
                            {canViewGitHub && run.htmlUrl && run.canCancel ? (
                              <DropdownMenuSeparator />
                            ) : null}
                            {run.canCancel ? (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setCancelRun(run.id)}
                              >
                                Cancel run
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  {query || actionName
                    ? 'No matching action runs.'
                    : data.actions.length
                      ? 'No action runs yet.'
                      : 'No actions configured.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {pageCount > 1 ? (
          <nav
            aria-label="Action runs pagination"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Page {pageIndex + 1} of {pageCount}
              {data.runs.length === 100 ? ' · Latest 100 runs' : null}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pageIndex === 0}
                onClick={() =>
                  setPagination({ filter: filterKey, page: pageIndex - 1 })
                }
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pageIndex === pageCount - 1}
                onClick={() =>
                  setPagination({ filter: filterKey, page: pageIndex + 1 })
                }
              >
                Next
              </Button>
            </div>
          </nav>
        ) : null}
      </section>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {typeof pendingAction?.confirm === 'object' &&
              pendingAction.confirm.title
                ? pendingAction.confirm.title
                : `Run ${pendingAction?.label ?? 'action'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {typeof pendingAction?.confirm === 'object' &&
              pendingAction.confirm.message
                ? pendingAction.confirm.message
                : 'This will trigger the configured GitHub Actions workflow.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingAction && void start(pendingAction)}
            >
              {typeof pendingAction?.confirm === 'object' &&
              pendingAction.confirm.button
                ? pendingAction.confirm.button
                : 'Run action'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelRun !== null}
        onOpenChange={(open) => !open && setCancelRun(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel action run?</AlertDialogTitle>
            <AlertDialogDescription>
              GitHub will stop the workflow if it is still running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => cancelRun && void manage(cancelRun, 'cancel')}
            >
              Cancel run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RepositoryAdminPage>
  )
}
