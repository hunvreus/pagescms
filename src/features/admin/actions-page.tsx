import { useEffect, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  EllipsisVertical,
  ExternalLink,
  LoaderCircle,
  Play,
  RotateCcw,
  X,
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
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
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

import { ActionsEmpty } from './actions-empty'
import { RepositoryAdminPage } from './repository-admin-page'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'

export function ActionsPage({
  owner,
  repo,
  branch,
  embedded = false,
  runsOnly = false,
  actionName,
  onViewRuns,
  onActionFilter,
}: {
  owner: string
  repo: string
  branch: string
  embedded?: boolean
  runsOnly?: boolean
  actionName?: string
  onViewRuns?: (name?: string) => void
  onActionFilter?: (name?: string) => void
}) {
  const params = { owner, repo, branch }
  const { data } = useSuspenseQuery(actionsQueryOptions(params, runsOnly))
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

  const hasActiveRuns = data.runs.some((run) => run.status !== 'completed')
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
  }, [hasActiveRuns, owner, repo, branch, queryClient])

  async function start(action: (typeof data.actions)[number]) {
    setPendingAction(null)
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
      embedded={embedded}
      hideHeading={runsOnly}
      title={runsOnly ? 'Recent runs' : 'Actions'}
      actions={
        !runsOnly && onViewRuns ? (
          <Button size="sm" variant="outline" onClick={() => onViewRuns()}>
            View runs
          </Button>
        ) : undefined
      }
    >
      <OperationError error={error} fallback="Could not update the action." />

      {!runsOnly ? (
        <section className="space-y-3">
          {data.actions.length ? (
            <div className="divide-y rounded-xl border bg-card">
              {data.actions.map((action) => (
                <div className="space-y-4 p-4" key={action.name}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium">{action.label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {action.workflow}
                      </p>
                    </div>
                    <ButtonGroup aria-label={`Run ${action.label}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={running !== null}
                        onClick={() =>
                          action.fields?.length
                            ? setFormAction(action.name)
                            : action.confirm === false
                              ? void start(action)
                              : setPendingAction(action)
                        }
                      >
                        {running === action.name ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Play />
                        )}
                        {running === action.name ? 'Starting' : 'Run'}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            aria-label={`More options for ${action.label}`}
                          >
                            <EllipsisVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          {canViewGitHub ? (
                            <DropdownMenuItem asChild>
                              <a
                                href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(action.workflow.replace(/^\.github\/workflows\//, ''))}?query=${encodeURIComponent(`branch:${branch}`)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View on GitHub{' '}
                                <ArrowUpRight className="ml-auto opacity-50" />
                              </a>
                            </DropdownMenuItem>
                          ) : null}
                          {onViewRuns ? (
                            <>
                              {canViewGitHub ? <DropdownMenuSeparator /> : null}
                              <DropdownMenuItem
                                onSelect={() => onViewRuns(action.name)}
                              >
                                View runs
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ButtonGroup>
                  </div>
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
                                            update(
                                              action.name,
                                              field.name,
                                              next,
                                            )
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
                                            field.type === 'number'
                                              ? 'number'
                                              : 'text'
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
                </div>
              ))}
            </div>
          ) : (
            <ActionsEmpty />
          )}
        </section>
      ) : null}

      {runsOnly ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
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
              className="sm:flex-1"
            />
            <Select
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
          </div>
          {data.runs.length === 100 ? (
            <p className="text-sm text-muted-foreground">
              Search and filters apply to the latest 100 runs.
            </p>
          ) : null}
          <Table
            aria-label="Recent action runs"
            containerClassName="overflow-visible rounded-xl border bg-card"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Triggered by</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRuns.length ? (
                visibleRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {data.actions.find(
                        (action) => action.name === run.actionName,
                      )?.label ?? run.actionName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          run.conclusion === 'failure'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {run.conclusion ?? run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.triggeredBy.name}</TableCell>
                    <TableCell>
                      {new Date(run.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="py-0 text-right">
                      <div className="flex justify-end gap-1">
                        {canViewGitHub && run.htmlUrl ? (
                          <Button asChild size="icon-sm" variant="ghost">
                            <a
                              aria-label="Open run on GitHub"
                              href={run.htmlUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <ExternalLink />
                            </a>
                          </Button>
                        ) : null}
                        {run.canCancel ? (
                          <Button
                            aria-label="Cancel action run"
                            disabled={managing === run.id}
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setCancelRun(run.id)}
                          >
                            {managing === run.id ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <X />
                            )}
                          </Button>
                        ) : null}
                        {run.canRerun && run.status === 'completed' ? (
                          <Button
                            aria-label="Run action again"
                            disabled={managing === run.id}
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => void manage(run.id, 'rerun')}
                          >
                            {managing === run.id ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <RotateCcw />
                            )}
                          </Button>
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
                      : 'No action runs yet.'}
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
      ) : null}

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
