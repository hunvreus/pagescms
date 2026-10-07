import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordRepositoryOpened } from './repository-activity.server'
import type { Database } from './database/client.server'

afterEach(() => vi.useRealTimers())

describe('repository activity', () => {
  it('coalesces repeated workspace writes and updates again after a minute', async () => {
    vi.useFakeTimers()
    const update = vi.fn().mockResolvedValue(undefined)
    const database = {
      insert: vi.fn(() => ({ values: () => ({ onConflictDoUpdate: update }) })),
    } as unknown as Database
    await Promise.all([
      recordRepositoryOpened(database, 'Owner', 'Repo'),
      recordRepositoryOpened(database, 'owner', 'repo'),
    ])
    expect(update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_001)
    await recordRepositoryOpened(database, 'owner', 'repo')
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('retries failed writes rather than marking them as recorded', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error('database failed'))
      .mockResolvedValue(undefined)
    const database = {
      insert: () => ({ values: () => ({ onConflictDoUpdate: update }) }),
    } as unknown as Database
    await expect(
      recordRepositoryOpened(database, 'owner', 'repo'),
    ).rejects.toThrow('database failed')
    await recordRepositoryOpened(database, 'owner', 'repo')
    expect(update).toHaveBeenCalledTimes(2)
  })
})
