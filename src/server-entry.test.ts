import { expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: vi.fn(async (_request: Request, _env: { getServices: () => unknown }) =>
    Response.json({ ok: true }),
  ),
}))
vi.mock('virtual:pagescms-request-services-bootstrap', () => ({
  getPublicBaseUrl: () => 'https://cms.test',
  getPluginHandlers: () => [{ path: '/plugin-handler', methods: ['GET'] }],
  createRequestServicesAccessorForRequest:
    (_request: Request, headers: Headers) => () => {
      headers.append('set-cookie', 'session_data=refreshed; Path=/; HttpOnly')
      return {}
    },
}))
vi.mock('#/server/routes/index', () => ({ api: { fetch: mocks.api } }))

it('routes API and mounted plugin requests to Hono', async () => {
  const { default: server } = await import('./server')
  const { default: packaged } = await import('./package/server-entry')
  expect(packaged).toBe(server)
  expect(
    server.handlesRequest(new Request('https://cms.test/plugin-handler')),
  ).toBe(true)
  expect(server.handlesRequest(new Request('https://cms.test/dashboard'))).toBe(
    false,
  )
  for (const path of [
    '/api/action-runs',
    '/api/repositories',
    '/api/cache/files',
    '/api/account',
    '/api/collaborators',
    '/api/admin/actions',
    '/api/branches',
    '/api/custom/plugin',
    '/plugin-handler',
  ]) {
    const response = await server.fetch(
      new Request(`https://cms.test${path}`, { method: 'POST' }),
    )
    expect(response.status).toBe(200)
  }
  expect(mocks.api).toHaveBeenCalledTimes(9)
})

it('forwards refreshed session cookies with the API response', async () => {
  const { default: server } = await import('./server')
  mocks.api.mockImplementationOnce(async (_request, env) => {
    env.getServices()
    return Response.json({ ok: true })
  })
  const response = await server.fetch(
    new Request('https://cms.test/api/session'),
  )
  expect(response.headers.getSetCookie()).toEqual([
    'session_data=refreshed; Path=/; HttpOnly',
  ])
})
