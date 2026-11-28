import { AccessDeniedError } from '#/server/access/policy'
import { describe, expect, it, vi } from 'vitest'
import { handlePluginRequest } from './plugin-request'
import type { RequestServices } from '#/server/context'
import type { PluginRoute } from '#/plugins/server'

const { requireManager, resolvePrincipal, admissionPrincipal } = vi.hoisted(
  () => ({
    requireManager: vi.fn(),
    resolvePrincipal: vi.fn(async () => ({
      type: 'user',
      id: 'user-1',
      repositoryIdentity: {
        source: 'github.com',
        externalId: '42',
        ownerId: '20',
      },
    })),
    admissionPrincipal: vi.fn(() => ({
      type: 'user',
      id: 'user-1',
      repositoryIdentity: {
        source: 'github.com',
        externalId: '42',
        ownerId: '20',
      },
    })),
  }),
)
vi.mock('#/server/access/repository-policy', () => ({
  requireRepositoryManager: requireManager,
  resolveRepositoryPrincipal: resolvePrincipal,
  repositoryAdmissionPrincipal: admissionPrincipal,
}))
function fixture(
  access: PluginRoute['access'] = 'user',
  method: PluginRoute['method'] = 'POST',
) {
  const handle = vi.fn(
    async (request: Request) => new Response(await request.text()),
  )
  const getSession = vi.fn(async () => ({
    user: { id: 'user-1', email: 'a@example.com', githubUsername: 'a' },
  }))
  const authorize = vi.fn()
  const services = {
    getSession,
    access: { authorize },
    configuration: { auth: { baseUrl: 'https://cms.example.com' } },
    repositoryAccess: {},
  } as unknown as RequestServices
  const routes = {
    [`${method} example/test`]: { method, path: 'test', access, handle },
  }
  const request = (
    origin: string | null = 'https://cms.example.com',
    query = '',
  ) =>
    new Request(`https://cms.example.com/api/plugins/example/test${query}`, {
      method,
      ...(origin
        ? { headers: { origin, 'x-pagescms-account': 'user-1' } }
        : {}),
      ...(method !== 'GET' ? { body: 'raw payload' } : {}),
    })
  return { services, routes, request, handle, getSession, authorize }
}
describe('plugin request boundary', () => {
  it('returns 404 without running authentication for an unknown route', async () => {
    const f = fixture()
    expect(
      (
        await handlePluginRequest(
          f.routes,
          'missing',
          'test',
          f.request(),
          f.services,
        )
      ).status,
    ).toBe(404)
    expect(f.getSession).not.toHaveBeenCalled()
  })
  it('leaves public webhook bodies intact and does not load a session', async () => {
    const f = fixture('public')
    const response = await handlePluginRequest(
      f.routes,
      'example',
      'test',
      f.request(null),
      f.services,
    )
    expect(await response.text()).toBe('raw payload')
    expect(f.getSession).not.toHaveBeenCalled()
  })
  it.each([null, 'https://evil.example.com'])(
    'rejects a mutation with origin %s',
    async (origin) => {
      const f = fixture()
      expect(
        (
          await handlePluginRequest(
            f.routes,
            'example',
            'test',
            f.request(origin),
            f.services,
          )
        ).status,
      ).toBe(403)
      expect(f.handle).not.toHaveBeenCalled()
    },
  )
  it('accepts a same-origin browser write forwarded over internal HTTP', async () => {
    const f = fixture()
    const request = new Request(
      'http://proxy.internal/api/plugins/example/test',
      {
        method: 'POST',
        headers: {
          origin: 'https://cms.example.com',
          'sec-fetch-site': 'same-origin',
          'x-pagescms-account': 'user-1',
        },
        body: 'forwarded',
      },
    )
    const response = await handlePluginRequest(
      f.routes,
      'example',
      'test',
      request,
      f.services,
    )
    expect(response.status).toBe(200)
    expect(f.handle).toHaveBeenCalledOnce()
  })
  it('requires an authenticated session', async () => {
    const f = fixture()
    f.getSession.mockResolvedValueOnce(null as never)
    expect(
      (
        await handlePluginRequest(
          f.routes,
          'example',
          'test',
          f.request(),
          f.services,
        )
      ).status,
    ).toBe(401)
    expect(f.handle).not.toHaveBeenCalled()
  })
  it('rejects missing repository coordinates', async () => {
    const f = fixture('repository')
    expect(
      (
        await handlePluginRequest(
          f.routes,
          'example',
          'test',
          f.request(),
          f.services,
        )
      ).status,
    ).toBe(400)
    expect(f.handle).not.toHaveBeenCalled()
  })
  it('establishes manager admission and policy authorization before dispatch', async () => {
    const f = fixture('manager')
    const response = await handlePluginRequest(
      f.routes,
      'example',
      'test',
      f.request(undefined, '?owner=acme&repo=site&branch=main'),
      f.services,
    )
    expect(response.status).toBe(200)
    expect(requireManager).toHaveBeenCalledWith(
      f.services.repositoryAccess,
      expect.objectContaining({ id: 'user-1' }),
      { owner: 'acme', repo: 'site', branch: 'main' },
    )
    expect(f.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'repository.manage',
        principal: expect.objectContaining({ type: 'user', id: 'user-1' }),
      }),
    )
    expect(f.handle).toHaveBeenCalledOnce()
  })
  it('pins manager plugin context to the admitted identity even without a client repo ID', async () => {
    const f = fixture('manager')
    admissionPrincipal.mockReturnValueOnce({
      type: 'user',
      id: 'user-1',
      repositoryIdentity: {
        source: 'github.com',
        externalId: '42',
        ownerId: '20',
      },
    })
    const response = await handlePluginRequest(
      f.routes,
      'example',
      'test',
      f.request(undefined, '?owner=acme&repo=site&branch=main'),
      f.services,
    )
    expect(response.status).toBe(200)
    expect(f.handle).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        repository: expect.objectContaining({ repoId: '42' }),
        repositoryIdentity: {
          source: 'github.com',
          externalId: '42',
          ownerId: '20',
        },
      }),
    )
  })
  it('never invokes the plugin when admission fails', async () => {
    const f = fixture('repository')
    resolvePrincipal.mockRejectedValueOnce(new Error('Access denied'))
    await expect(
      handlePluginRequest(
        f.routes,
        'example',
        'test',
        f.request(undefined, '?owner=acme&repo=site&branch=main'),
        f.services,
      ),
    ).rejects.toThrow('Access denied')
    expect(f.handle).not.toHaveBeenCalled()
  })
  it('returns 403 for an authorization denial, without swallowing provider failures', async () => {
    const f = fixture('repository')
    f.authorize.mockRejectedValueOnce(
      new AccessDeniedError({ allowed: false, reason: 'permission_denied' }),
    )
    expect(
      (
        await handlePluginRequest(
          f.routes,
          'example',
          'test',
          f.request(undefined, '?owner=acme&repo=site&branch=main'),
          f.services,
        )
      ).status,
    ).toBe(403)
    expect(f.handle).not.toHaveBeenCalled()
    f.authorize.mockRejectedValueOnce(new Error('Provider offline'))
    await expect(
      handlePluginRequest(
        f.routes,
        'example',
        'test',
        f.request(undefined, '?owner=acme&repo=site&branch=main'),
        f.services,
      ),
    ).rejects.toThrow('Provider offline')
  })
  it('rejects an authenticated plugin request from a stale account view', async () => {
    const f = fixture()
    const request = f.request()
    request.headers.set('x-pagescms-account', 'previous-user')
    expect(
      (
        await handlePluginRequest(
          f.routes,
          'example',
          'test',
          request,
          f.services,
        )
      ).status,
    ).toBe(409)
    expect(f.handle).not.toHaveBeenCalled()
  })
})
