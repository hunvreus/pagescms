export type ActionBranch = { owner: string; repo: string; branch: string }
export type TrackedRun = {
  id: number
  status: string
  conclusion: string | null
}
export type StatusRequest = ActionBranch & { runIds: number[] }
export type StatusResult<T extends TrackedRun> = ActionBranch & {
  runs: T[]
  runIds?: number[]
}
const key = (ref: ActionBranch) =>
  JSON.stringify([ref.owner.toLowerCase(), ref.repo.toLowerCase(), ref.branch])

// One scheduler batches table subscriptions and mutation notifications, without overlapping requests.
export function createActionRunTracker<T extends TrackedRun>({
  fetch,
  update,
  failed,
  visible,
}: {
  fetch: (requests: StatusRequest[]) => Promise<StatusResult<T>[]>
  update: (result: StatusResult<T>) => void
  failed: (error: unknown) => void
  visible: () => boolean
}) {
  const tables = new Map<symbol, { ref: ActionBranch; ids: Set<number> }>()
  const tracked = new Map<string, { ref: ActionBranch; ids: Set<number> }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let busy = false
  let failures = 0
  function requests() {
    const groups = new Map<string, { ref: ActionBranch; ids: Set<number> }>()
    for (const entry of [...tables.values(), ...tracked.values()]) {
      if (!entry.ids.size) continue
      const id = key(entry.ref)
      const group = groups.get(id) ?? { ref: entry.ref, ids: new Set<number>() }
      entry.ids.forEach((runId) => group.ids.add(runId))
      groups.set(id, group)
    }
    return [...groups.values()].map(({ ref, ids }) => ({
      ...ref,
      runIds: [...ids],
    }))
  }
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!busy && visible() && requests().length)
      timer = setTimeout(() => void poll(), 15_000)
  }
  async function poll() {
    if (busy || !visible()) return
    const batch = requests()
    if (!batch.length) return
    if (timer) clearTimeout(timer)
    timer = undefined
    busy = true
    try {
      const results = await fetch(batch)
      failures = 0
      for (const result of results) {
        update(result)
        const active = new Set(
          result.runs
            .filter((run) => run.status !== 'completed')
            .map((run) => run.id),
        )
        for (const entry of [...tables.values(), ...tracked.values()]) {
          if (key(entry.ref) !== key(result)) continue
          entry.ids.forEach((id) => {
            if (!active.has(id)) entry.ids.delete(id)
          })
        }
      }
    } catch (error) {
      // Stop after repeated failures; avoid an endless background retry loop after logout/access revocation.
      if (++failures >= 3) {
        tables.clear()
        tracked.clear()
        failed(error)
      }
    } finally {
      busy = false
      schedule()
    }
  }
  return {
    watch(ref: ActionBranch, ids: number[]) {
      const id = Symbol()
      tables.set(id, { ref, ids: new Set(ids) })
      schedule()
      return () => {
        tables.delete(id)
        schedule()
      }
    },
    track(ref: ActionBranch, runId: number) {
      const id = key(ref)
      const entry = tracked.get(id) ?? { ref, ids: new Set<number>() }
      entry.ids.add(runId)
      tracked.set(id, entry)
      schedule()
    },
    forget(ref: ActionBranch, runId: number) {
      tracked.get(key(ref))?.ids.delete(runId)
      schedule()
    },
    visibilityChanged() {
      if (visible()) void poll()
      else schedule()
    },
    dispose() {
      if (timer) clearTimeout(timer)
      tables.clear()
      tracked.clear()
    },
  }
}

// Newly acknowledged runs belong at the start of the latest-100 window; status
// updates retain the position of runs already shown and never duplicate them.
export function mergeRunUpdates<T extends { id: number }>(
  current: T[],
  incoming: T[],
  requested?: number[],
) {
  const updates = new Map(incoming.map((run) => [run.id, run]))
  const existing = new Set(current.map((run) => run.id))
  return [
    ...incoming.filter((run) => !existing.has(run.id)),
    ...current
      .filter((run) => !requested?.includes(run.id) || updates.has(run.id))
      .map((run) => updates.get(run.id) ?? run),
  ].slice(0, 100)
}
