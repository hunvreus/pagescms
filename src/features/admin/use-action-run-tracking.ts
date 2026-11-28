import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ActionBranch } from '#/lib/action-run-tracker'

export function useActionRunTracking(
  ref: ActionBranch,
  runs: { id: number; status: string }[],
  updatedAt: number,
) {
  const client = useQueryClient()
  const ids = runs
    .filter((run) => run.status !== 'completed')
    .map((run) => run.id)
    .sort((a, b) => a - b)
    .join(',')
  useEffect(() => {
    if (!ids) return
    let stopped = false
    let unwatch: (() => void) | undefined
    void import('#/lib/action-run-tracking').then(({ actionRunTracking }) => {
      if (!stopped)
        unwatch = actionRunTracking(client).watch(
          ref,
          ids.split(',').map(Number),
        )
    })
    return () => {
      stopped = true
      unwatch?.()
    }
  }, [client, ref.owner, ref.repo, ref.branch, ids, updatedAt])
}
