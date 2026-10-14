import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActionRunTracker, mergeRunUpdates } from './action-run-tracker'

const ref = { owner: 'pagescms', repo: 'test', branch: 'main' }
function setup() {
  let visible = true
  const fetch = vi
    .fn()
    .mockResolvedValue([
      { ...ref, runs: [{ id: 1, status: 'in_progress', conclusion: null }] },
    ])
  const update = vi.fn()
  const failed = vi.fn()
  const tracker = createActionRunTracker({
    fetch,
    update,
    failed,
    visible: () => visible,
  })
  return {
    tracker,
    fetch,
    update,
    failed,
    hide: () => {
      visible = false
      tracker.visibilityChanged()
    },
    show: () => {
      visible = true
      tracker.visibilityChanged()
    },
  }
}
afterEach(() => vi.useRealTimers())
describe('shared action run polling', () => {
  it('batches duplicate toast/table runs in one request every 15 seconds', async () => {
    vi.useFakeTimers()
    const { tracker, fetch } = setup()
    const unwatch = tracker.watch(ref, [1])
    tracker.track(ref, 1)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledWith([{ ...ref, runIds: [1] }])
    expect(fetch).toHaveBeenCalledOnce()
    unwatch()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetch).toHaveBeenCalledTimes(2)
    tracker.dispose()
  })
  it('pauses in hidden tabs and refreshes immediately when visible', async () => {
    vi.useFakeTimers()
    const { tracker, fetch, hide, show } = setup()
    tracker.track(ref, 1)
    hide()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).not.toHaveBeenCalled()
    show()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledOnce()
    tracker.dispose()
  })
  it('updates both consumers and stops after completion or missing runs', async () => {
    vi.useFakeTimers()
    const { tracker, fetch, update } = setup()
    fetch.mockResolvedValue([
      { ...ref, runs: [{ id: 1, status: 'completed', conclusion: 'success' }] },
    ])
    tracker.watch(ref, [1, 2])
    tracker.track(ref, 1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith({
      ...ref,
      runs: [{ id: 1, status: 'completed', conclusion: 'success' }],
    })
    tracker.dispose()
  })
  it('stops when the table closes and there is no tracked toast', async () => {
    vi.useFakeTimers()
    const { tracker, fetch } = setup()
    const unwatch = tracker.watch(ref, [1])
    unwatch()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetch).not.toHaveBeenCalled()
    tracker.dispose()
  })
  it('does not overlap slow requests', async () => {
    vi.useFakeTimers()
    const { tracker, fetch } = setup()
    let resolve!: (value: never[]) => void
    fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    tracker.track(ref, 1)
    await vi.advanceTimersByTimeAsync(60_000)
    tracker.visibilityChanged()
    expect(fetch).toHaveBeenCalledOnce()
    resolve([])
    await vi.advanceTimersByTimeAsync(0)
    tracker.dispose()
  })
  it('stops repeated failures rather than retrying forever after access is revoked', async () => {
    vi.useFakeTimers()
    const { tracker, fetch, failed } = setup()
    fetch.mockRejectedValue(new Error('Access denied'))
    tracker.track(ref, 1)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(failed).toHaveBeenCalledOnce()
    tracker.dispose()
  })
})

it('puts new confirmed runs first, replaces statuses without duplicating, and retains unrelated runs', () => {
  const current = [
    { id: 2, status: 'queued' },
    { id: 1, status: 'running' },
  ]
  expect(
    mergeRunUpdates(current, [
      { id: 3, status: 'queued' },
      { id: 2, status: 'completed' },
    ]),
  ).toEqual([
    { id: 3, status: 'queued' },
    { id: 2, status: 'completed' },
    current[1],
  ])
  expect(mergeRunUpdates(current, [], [2])).toEqual([current[1]])
  const full = Array.from({ length: 100 }, (_, index) => ({ id: 100 - index }))
  const updated = mergeRunUpdates(full, [{ id: 101 }])
  expect(updated).toHaveLength(100)
  expect(updated[0].id).toBe(101)
  expect(updated.at(-1)?.id).toBe(2)
})
