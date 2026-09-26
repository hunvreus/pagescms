import { describe, expect, it, vi } from 'vitest'

import { checkDatabaseReadiness } from './health.server'

import type { Database } from './database/client.server'

describe('database readiness', () => {
  it('resolves when the database accepts a query', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as Database

    await expect(checkDatabaseReadiness(database)).resolves.toBeUndefined()
    expect(database.execute).toHaveBeenCalledOnce()
  })

  it('rejects when the database query fails', async () => {
    const database = {
      execute: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as Database

    await expect(checkDatabaseReadiness(database)).rejects.toThrow(
      'connection refused',
    )
  })

  it('does not wait indefinitely for the database', async () => {
    const database = {
      execute: vi.fn().mockReturnValue(new Promise(() => undefined)),
    } as unknown as Database

    await expect(checkDatabaseReadiness(database, 1)).rejects.toThrow(
      'Database readiness check timed out',
    )
  })
})
