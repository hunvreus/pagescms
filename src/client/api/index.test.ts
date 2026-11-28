import { afterEach, expect, it, vi } from 'vitest'
import { bindApiAccount, readApi } from '#/client/api/index'

afterEach(() => {
  bindApiAccount(() => undefined)
  vi.unstubAllGlobals()
})
it('preserves a safe operation error regardless of HTTP status', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { code: 'operation_error', message: 'Invitations are unavailable' },
        { status: 503 },
      ),
    ),
  )
  await expect(readApi('/api/collaborators')).rejects.toThrow(
    'Invitations are unavailable',
  )
})

it('sends the active account with an API write', async () => {
  bindApiAccount(() => 'alice')
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetcher)
  await readApi('/api/entries/raw', { method: 'POST' })
  const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
  expect(headers.get('x-pagescms-account')).toBe('alice')
})
