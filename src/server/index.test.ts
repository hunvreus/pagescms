import { expect, it, vi } from 'vitest'
import app from './index'

const { accessor } = vi.hoisted(() => ({ accessor: vi.fn() }))

vi.mock('virtual:pagescms-request-services-bootstrap', () => ({
  createRequestServicesAccessorForRequest: accessor,
  getPublicBaseUrl: () => 'https://cms.test',
  getPluginHandlers: () => [],
}))

vi.mock('#/server/routes/index', () => ({
  api: { fetch: async () => new Response('ok') },
}))

it('passes the request-specific background lifecycle hook to services', async () => {
  const request = new Request('https://example.com/api/health')
  const waitUntil = vi.fn()
  const response = await app.fetch(request, waitUntil)

  expect(response.status).toBe(200)
  expect(accessor).toHaveBeenCalledWith(request, expect.any(Headers), waitUntil)
})
