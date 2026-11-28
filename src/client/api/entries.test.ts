import { afterEach, expect, it, vi } from 'vitest'
import { isNotFound } from '@tanstack/react-router'
import { readEntry } from '#/client/api/entries'

afterEach(() => vi.unstubAllGlobals())

it('maps a missing API entry to the router not-found state', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ code: 'not_found' }, { status: 404 })),
  )
  const error = await readEntry({
    owner: 'owner',
    repo: 'site',
    branch: 'main',
    name: 'posts',
    path: 'posts/missing.md',
  }).catch((value: unknown) => value)
  expect(isNotFound(error)).toBe(true)
})
