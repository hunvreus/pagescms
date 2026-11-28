import { expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import type { RequestServices } from '#/server/context'

const calls = vi.hoisted(() => ({ media: vi.fn(), plugin: vi.fn() }))
vi.mock('#/server/media/preview', () => ({ mediaPreviewResponse: calls.media }))
vi.mock('#/server/routes/plugin-request', () => ({
  handlePluginRequest: calls.plugin,
}))
const services = { pluginRoutes: {} } as unknown as RequestServices

it('passes encoded branch and media paths to the preview handler', async () => {
  calls.media.mockResolvedValueOnce(new Response('preview'))
  const response = await api.request(
    'https://cms.test/api/media-preview/owner/site/feature%2Fnew/images/a%20b/photo.png',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(200)
  expect(calls.media).toHaveBeenCalledWith(expect.any(Request), services, {
    owner: 'owner',
    repo: 'site',
    branch: 'feature/new',
    name: 'images',
    _splat: 'a b/photo.png',
  })
})

it('passes the plugin and decoded subpath to the plugin handler', async () => {
  calls.plugin.mockResolvedValueOnce(new Response('plugin'))
  const response = await api.request(
    'https://cms.test/api/plugins/example/items/a%20b',
    { method: 'POST' },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(200)
  expect(calls.plugin).toHaveBeenCalledWith(
    services.pluginRoutes,
    'example',
    'items/a b',
    expect.any(Request),
    services,
  )
})

it('dispatches mounted API handlers and enforces their methods', async () => {
  const handle = vi.fn(async () => new Response('mounted'))
  const mounted = {
    pluginHandlers: [{ path: '/api/custom/*', methods: ['GET'], handle }],
  } as unknown as RequestServices
  const env = {
    publicBaseUrl: 'https://cms.test',
    getServices: () => mounted,
    requestId: 'request-1',
  }
  const response = await api.request(
    'https://cms.test/api/custom/item',
    {},
    env,
  )
  expect(await response.text()).toBe('mounted')
  expect(handle).toHaveBeenCalledWith(expect.any(Request), {
    services: mounted,
    requestId: 'request-1',
  })
  const denied = await api.request(
    'https://cms.test/api/custom/item',
    { method: 'POST' },
    env,
  )
  expect(denied.status).toBe(405)
  expect(denied.headers.get('allow')).toBe('GET')
  expect(
    (await api.request('https://cms.test/api/missing', {}, env)).status,
  ).toBe(404)
})
