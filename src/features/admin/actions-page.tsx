import { useEffect, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ExternalLink, LoaderCircle, Play, RotateCcw, X } from 'lucide-react'

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
import { Checkbox } from '#/components/ui/checkbox'
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

export function ActionsPage({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch: string
}) {
  const params = { owner, repo, branch }
  const { data } = useSuspenseQuery(actionsQueryOptions(params))
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
    actionName: string,
    fieldName: string,
    value: string | number | boolean | undefined,
  ) {
    setValues((current) => {
      const actionValues = { ...current[actionName] }
      if (value === undefined) delete actionValues[fieldName]
      else actionValues[fieldName] = value
      return { ...current, [actionName]: actionValues }
    })
  }

  return (
    <RepositoryAdminPage title="Actions">
      <div>
        <p className="text-sm text-muted-foreground">
          Actions are GitHub Actions workflows configured in .pages.yml. Run
          them here and follow their latest status below.
        </p>
        <OperationError error={error} fallback="Could not update the action." />
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Available actions</h2>
        {data.actions.length ? (
          <div className="divide-y rounded-lg border">
            {data.actions.map((action) => (
              <div className="space-y-4 p-4" key={action.name}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{action.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      Workflow: {action.workflow}
                    </p>
                  </div>
                  <Button
                    disabled={running !== null}
                    onClick={() =>
                      action.confirm === false
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
                </div>
                {action.fields?.length ? (
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
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No repository actions are configured.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Recent runs</h2>
        <div className="overflow-hidden rounded-lg border">
          <Table aria-label="Recent action runs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Triggered by</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="w-px text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runs.length ? (
                data.runs.map((run) => (
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
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {run.htmlUrl ? (
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
                    className="h-24 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No action runs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
