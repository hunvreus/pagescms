import { describe, expect, it, vi } from 'vitest'

import {
  createBackgroundExecutor,
  systemClock,
  webCryptoIdentifierGenerator,
} from './runtime-ports.server'

describe('Worker-safe runtime ports', () => {
  it('registers background promises through the execution context', async () => {
    const registered: Promise<unknown>[] = []
    const executionContext = {
      marker: 'context',
      waitUntil(this: { marker: string }, promise: Promise<unknown>) {
        expect(this.marker).toBe('context')
        registered.push(promise)
      },
    }
    const background = createBackgroundExecutor(executionContext)
    const task = Promise.resolve('done')

    background.defer(task)

    expect(registered).toEqual([task])
    await expect(registered[0]).resolves.toBe('done')
  })

  it('uses injectable clock and Web Crypto identifiers', () => {
    const before = Date.now()
    const now = systemClock.now()
    const after = Date.now()

    expect(now.getTime()).toBeGreaterThanOrEqual(before)
    expect(now.getTime()).toBeLessThanOrEqual(after)
    expect(webCryptoIdentifierGenerator.create()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('allows deterministic substitutes in services', () => {
    const clock = { now: vi.fn(() => new Date('2026-01-01T00:00:00Z')) }
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})
