import { toast } from 'sonner'
import { getActionRunStatuses, manageAction } from '#/functions/actions'
import { actionsQueryOptions } from '#/queries/repository'
import { createActionRunTracker, mergeRunUpdates } from './action-run-tracker'
import type { ActionBranch } from './action-run-tracker'
import type { QueryClient } from '@tanstack/react-query'

type Notification = {
  ref: ActionBranch
  runId: number
  label: string
  state: string
  id: string | number
  expires: number
}

type Run = Awaited<
  ReturnType<typeof getActionRunStatuses>
>[number]['runs'][number]
const trackers = new WeakMap<QueryClient, ReturnType<typeof createTracker>>()
const branchKey = (ref: ActionBranch) =>
  JSON.stringify([ref.owner.toLowerCase(), ref.repo.toLowerCase(), ref.branch])

function createTracker(client: QueryClient) {
  const notifications = new Map<string, Notification>()
  function notify(run: Run, item: Notification) {
    const state = `${run.status}:${run.conclusion}:${run.canCancel}`
    if (item.state === state) return
    item.state = state
    if (run.status === 'completed') {
      const labels: Record<string, string> = {
        success: 'succeeded',
        failure: 'failed',
        cancelled: 'was cancelled',
        timed_out: 'timed out',
        skipped: 'was skipped',
        startup_failure: 'failed to start',
        action_required: 'needs attention',
        stale: 'became stale',
      }
      const conclusion = run.conclusion ?? ''
      const result = labels[conclusion] ?? 'completed'
      const show =
        conclusion === 'success'
          ? toast.success
          : [
                'failure',
                'timed_out',
                'startup_failure',
                'action_required',
                'stale',
              ].includes(conclusion)
            ? toast.error
            : toast.message
      show(`“${item.label}” ${result}`, {
        id: item.id,
        action: undefined,
        duration: 5_000,
      })
      return
    }
    toast.loading(
      run.status === 'in_progress'
        ? `“${item.label}” is running`
        : `“${item.label}” is queued`,
      {
        id: item.id,
        duration: Infinity,
        action: run.canCancel
          ? {
              label: 'Cancel',
              onClick: () => {
                void manageAction({
                  data: { ...item.ref, runId: run.id, intent: 'cancel' },
                })
                  .then((updated) => {
                    patch(item.ref, [updated])
                    notify(updated, item)
                    notifications.delete(`${branchKey(item.ref)}:${run.id}`)
                    tracker.forget(item.ref, run.id)
                  })
                  .catch(() => {
                    toast.error(`Could not cancel “${item.label}”`)
                  })
              },
            }
          : undefined,
      },
    )
  }
  function patch(ref: ActionBranch, runs: Run[], requested?: number[]) {
    client.setQueryData(actionsQueryOptions(ref).queryKey, (previous) => {
      if (!previous) return previous
      return {
        ...previous,
        runs: mergeRunUpdates(previous.runs, runs, requested),
      }
    })
  }
  const tracker = createActionRunTracker<Run>({
    fetch: (data) => getActionRunStatuses({ data }),
    visible: () => document.visibilityState === 'visible',
    update: (result) => {
      patch(result, result.runs, result.runIds)
      const runs = new Map(result.runs.map((run) => [run.id, run]))
      for (const [key, item] of notifications) {
        if (branchKey(item.ref) !== branchKey(result)) continue
        const run = runs.get(item.runId)
        if (!run || Date.now() > item.expires) {
          toast.message(`Stopped tracking “${item.label}”`, {
            id: item.id,
            action: undefined,
            duration: 5_000,
          })
          notifications.delete(key)
          tracker.forget(item.ref, item.runId)
        } else {
          notify(run, item)
          if (run.status === 'completed') notifications.delete(key)
        }
      }
    },
    failed: () => {
      if (!notifications.size)
        toast.error(
          'Could not update action runs. Refresh Actions to try again.',
        )
      for (const item of notifications.values())
        toast.error(
          `Could not update “${item.label}”. Check Actions for its status.`,
          { id: item.id, action: undefined, duration: 5_000 },
        )
      notifications.clear()
    },
  })
  document.addEventListener('visibilitychange', tracker.visibilityChanged)
  window.addEventListener('online', tracker.visibilityChanged)
  return {
    watch: tracker.watch,
    track(ref: ActionBranch, run: Run, label: string) {
      const key = `${branchKey(ref)}:${run.id}`
      if (notifications.has(key)) return
      const item = {
        ref,
        runId: run.id,
        label,
        state: '',
        id: toast.loading(`“${label}” is queued`),
        expires: Date.now() + 12 * 60 * 60 * 1000,
      }
      notifications.set(key, item)
      patch(ref, [run])
      notify(run, item)
      if (run.status !== 'completed') tracker.track(ref, run.id)
      else notifications.delete(key)
    },
  }
}
export function actionRunTracking(client: QueryClient) {
  let tracker = trackers.get(client)
  if (!tracker) {
    tracker = createTracker(client)
    trackers.set(client, tracker)
  }
  return tracker
}
