import { useLingui } from '@lingui/react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { repositoryRequest } from '#/lib/repository-identity'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/pending-writes/use-operation'
import { toast } from '#/lib/notifications'
import { formatDistanceToNow } from '#/i18n/dates'
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
import Play from '@hugeicons/core-free-icons/PlayIcon'
import ReloadIcon from '@hugeicons/core-free-icons/ReloadIcon'
import EllipsisVertical from '@hugeicons/core-free-icons/EllipsisVerticalIcon'
import ChevronDown from '@hugeicons/core-free-icons/ChevronDownIcon'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'

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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableErrorRow,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { manageAction, runAction } from '#/client/api/actions'
import { actionsQueryOptions } from '#/client/queries/repository'

import { RepositoryAdminPage } from './repository-admin-page'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'

export function ActionsPage({
  owner,
  repo,
  branch,
  repoId,
  actionName,
  onActionFilter,
}: {
  owner: string
  repo: string
  branch: string
  repoId?: string
  actionName?: string
  onActionFilter?: (name?: string) => void
}) {
  const { t: _t } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const params = { owner, repo, branch, repoId }
  const dispatch = useOperation<Awaited<ReturnType<typeof runAction>>>(
    operationKey('workflow-dispatch', params),
  )
  const management = useOperation<Awaited<ReturnType<typeof manageAction>>>(
    operationKey('workflow-management', params),
  )
  const {
    data,
    error: readError,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useSuspenseQuery(actionsQueryOptions(params))
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
  const [managing, setManaging] = useState<{
    id: number
    intent: 'cancel' | 'rerun'
  } | null>(null)
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
    if (dispatch.pending) return
    setPendingAction(null)
    setRunning(action.name)
    setError(null)
    try {
      await dispatch.run({
        run: () =>
          runAction({
            ...repositoryRequest(params),
            actionName: action.name,
            inputs: values[action.name] ?? {},
          }),
        failureMessage: _t({ message: 'Could not run action.' }),
        confirmed: async (run, active) => {
          if (!active()) return
          const { actionRunTracking } =
            await import('#/lib/action-run-tracking')
          if (!active()) return
          actionRunTracking(queryClient).track(params, run, action.label)
          refreshQueries(queryClient, [actionsQueryOptions(params).queryKey])
        },
      })
      setFormAction(null)
    } catch {
      // The operation boundary reports this failure.
    } finally {
      setRunning(null)
    }
  }

  async function manage(runId: number, intent: 'cancel' | 'rerun') {
    if (management.pending) return
    setCancelRun(null)
    setManaging({ id: runId, intent })
    setError(null)
    try {
      await management.run({
        run: () =>
          manageAction({ ...repositoryRequest(params), runId, intent }),
        failureMessage: _t({ message: 'Could not manage action run.' }),
        confirmed: async (run, active) => {
          if (!active()) return
          if (intent === 'rerun') {
            const { actionRunTracking } =
              await import('#/lib/action-run-tracking')
            if (!active()) return
            actionRunTracking(queryClient).track(
              params,
              run,
              actionOptions.get(run.actionName) ?? run.actionName,
            )
          } else {
            queryClient.setQueryData(
              actionsQueryOptions(params).queryKey,
              (previous) =>
                previous
                  ? {
                      ...previous,
                      runs: previous.runs.map((current) =>
                        current.id === run.id ? run : current,
                      ),
                    }
                  : previous,
            )
            toast.success(_t({ message: 'Cancellation requested' }))
          }
          refreshQueries(queryClient, [actionsQueryOptions(params).queryKey])
        },
      })
    } catch {
      // The operation boundary reports this failure.
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

  const refresh = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              aria-busy={isFetching}
              aria-label={_t({ message: 'Refresh action runs' })}
              size="icon"
              variant="outline"
              disabled={
                isFetching || (!data.actions.length && !data.runs.length)
              }
              onClick={() =>
                void refetch().then((result) => setError(result.error))
              }
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={ReloadIcon}
                className={isFetching ? 'animate-spin' : undefined}
              />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <UiTrans>Refresh</UiTrans>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  const toolbar = (
    <>
      <span className="hidden md:contents">{refresh}</span>
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
          aria-label={_t({ message: 'Filter runs by action' })}
          className="min-w-0 flex-1 md:w-48 md:flex-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">
              <UiTrans>All actions</UiTrans>
            </SelectItem>
            {[...actionOptions].map(([name, label]) => (
              <SelectItem key={name} value={`action:${name}`}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <SearchInput
        groupClassName="min-w-0 flex-1 md:w-64 md:flex-none"
        disabled={!data.runs.length}
        aria-label={_t({ message: 'Search action runs' })}
        placeholder={_t({ message: 'Search runs…' })}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setPagination({
            filter: `${actionName ?? ''}:${event.target.value}`,
            page: 0,
          })
        }}
      />
    </>
  )

  return (
    <RepositoryAdminPage
      title={_t({ message: 'Actions' })}
      toolbar={toolbar}
      actions={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <span className="md:hidden">{refresh}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={_t({ message: 'Run' })}
                className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
                aria-busy={dispatch.pending || running !== null}
                disabled={
                  !data.actions.length || dispatch.pending || running !== null
                }
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Play}
                  className={
                    dispatch.pending || running !== null
                      ? 'max-md:hidden'
                      : undefined
                  }
                  data-icon="inline-start"
                />
                <span className="hidden md:inline">
                  <UiTrans>Run</UiTrans>
                </span>
                {dispatch.pending || running !== null ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : (
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={ChevronDown}
                    className="hidden md:block"
                    data-icon="inline-end"
                  />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-max min-w-32 max-w-[calc(100vw-2rem)]"
            >
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
      <div className="-mt-4 flex items-center gap-2 md:hidden">{toolbar}</div>
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
                    <UiTrans>
                      Configure inputs before running this workflow.
                    </UiTrans>
                  </DialogDescription>
                </DialogHeader>
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
                    <Button
                      aria-busy={dispatch.pending && running === action.name}
                      disabled={running !== null || dispatch.pending}
                      type="submit"
                    >
                      <UiTrans>Run</UiTrans>
                      {dispatch.pending && running === action.name ? (
                        <Spinner aria-hidden="true" data-icon="inline-end" />
                      ) : null}
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
            <UiTrans>Search and filters apply to the latest 100 runs.</UiTrans>
          </p>
        ) : null}
        <Table
          aria-label={_t({ message: 'Recent action runs' })}
          containerClassName="rounded-xl border bg-card"
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <UiTrans>Status</UiTrans>
              </TableHead>
              <TableHead>
                <UiTrans>Action</UiTrans>
              </TableHead>
              <TableHead>
                <UiTrans>Triggered by</UiTrans>
              </TableHead>
              <TableHead>
                <UiTrans>Started</UiTrans>
              </TableHead>
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
                            {formatDistanceToNow(
                              new Date(run.createdAt),
                              {
                                addSuffix: true,
                              },
                              dateI18n.locale,
                            )}
                          </time>
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Intl.DateTimeFormat(dateI18n.locale, {
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
                          aria-busy={
                            managing?.id === run.id &&
                            managing.intent === 'rerun'
                          }
                          aria-label={_t({ message: 'Run action again' })}
                          disabled={
                            management.pending || managing?.id === run.id
                          }
                          size="sm"
                          variant="outline"
                          onClick={() => void manage(run.id, 'rerun')}
                        >
                          <UiTrans>Run again</UiTrans>
                          {managing?.id === run.id &&
                          managing.intent === 'rerun' ? (
                            <Spinner
                              aria-hidden="true"
                              data-icon="inline-end"
                            />
                          ) : null}
                        </Button>
                      ) : null}
                      {(canViewGitHub && run.htmlUrl) || run.canCancel ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-busy={
                                managing?.id === run.id &&
                                managing.intent === 'cancel'
                              }
                              aria-label={_t({
                                message: `Actions for run ${run.id}`,
                              })}
                              size="icon-sm"
                              variant="outline"
                              disabled={
                                management.pending || managing?.id === run.id
                              }
                            >
                              {managing?.id === run.id &&
                              managing.intent === 'cancel' ? (
                                <Spinner aria-hidden="true" />
                              ) : (
                                <HugeiconsIcon
                                  aria-hidden="true"
                                  icon={EllipsisVertical}
                                />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-max min-w-32 max-w-[calc(100vw-2rem)]"
                          >
                            {canViewGitHub && run.htmlUrl ? (
                              <DropdownMenuItem asChild>
                                <a
                                  href={run.htmlUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                  className="whitespace-nowrap"
                                >
                                  <UiTrans>View on GitHub</UiTrans>
                                  <HugeiconsIcon
                                    aria-hidden="true"
                                    icon={ArrowUpRight}
                                    className="ml-auto opacity-50"
                                  />
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
                                <UiTrans>Cancel run</UiTrans>
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : !(error ?? readError) ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  {query || actionName
                    ? _t({ message: 'No matching action runs.' })
                    : data.actions.length
                      ? _t({ message: 'No action runs yet.' })
                      : _t({ message: 'No actions configured.' })}
                </TableCell>
              </TableRow>
            ) : null}
            {(error ?? readError) ? (
              <TableErrorRow
                colSpan={5}
                message={_t({
                  message:
                    'Could not refresh actions. The displayed results may be out of date.',
                })}
                onRetry={() =>
                  void refetch().then((result) => setError(result.error))
                }
                retrying={isFetching}
              />
            ) : null}
          </TableBody>
        </Table>
        {pageCount > 1 ? (
          <nav
            aria-label={_t({ message: 'Action runs pagination' })}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p aria-live="polite" className="text-sm text-muted-foreground">
              <UiTrans>
                Page {pageIndex + 1} of {pageCount}
              </UiTrans>
              {data.runs.length === 100
                ? _t({ message: ' · Latest 100 runs' })
                : null}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pageIndex === 0}
                onClick={() =>
                  setPagination({ filter: filterKey, page: pageIndex - 1 })
                }
              >
                <UiTrans>Previous</UiTrans>
              </Button>
              <Button
                variant="outline"
                disabled={pageIndex === pageCount - 1}
                onClick={() =>
                  setPagination({ filter: filterKey, page: pageIndex + 1 })
                }
              >
                <UiTrans>Next</UiTrans>
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
                : _t({ message: `Run ${pendingAction?.label ?? 'action'}?` })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {typeof pendingAction?.confirm === 'object' &&
              pendingAction.confirm.message
                ? pendingAction.confirm.message
                : _t({
                    message:
                      'This will trigger the configured GitHub Actions workflow.',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingAction && void start(pendingAction)}
            >
              {typeof pendingAction?.confirm === 'object' &&
              pendingAction.confirm.button
                ? pendingAction.confirm.button
                : _t({ message: 'Run action' })}
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
            <AlertDialogTitle>
              <UiTrans>Cancel action run?</UiTrans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <UiTrans>
                GitHub will stop the workflow if it is still running.
              </UiTrans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <UiTrans>Keep running</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => cancelRun && void manage(cancelRun, 'cancel')}
            >
              <UiTrans>Cancel run</UiTrans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RepositoryAdminPage>
  )
}
