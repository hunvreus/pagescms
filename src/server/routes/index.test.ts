import { afterEach, expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import { AccessDeniedError } from '#/server/access/policy'
import type { RequestServices } from '#/server/context'

afterEach(() => vi.resetAllMocks())

it.each([true, false])(
  'bounds request bytes before parsing, content length supplied: %s',
  async (declared) => {
    const getServices = vi.fn()
    const response = await api.request(
      'https://cms.test/api/account/deleted-local',
      {
        method: 'POST',
        headers: {
          origin: 'https://cms.test',
          ...(declared ? { 'content-length': '1048577' } : {}),
        },
        body: declared ? '{}' : 'x'.repeat(1048577),
      },
      { publicBaseUrl: 'https://cms.test', getServices },
    )
    expect(response.status).toBe(413)
    expect(getServices).not.toHaveBeenCalled()
  },
)

it('allows sign-out after the browser account changes', async () => {
  const handler = vi.fn(async () => new Response(null, { status: 200 }))
  const services = {
    getSession: async () => ({ user: { id: 'bob' } }),
    auth: { handler },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/auth/sign-out',
    { method: 'POST', headers: { 'x-pagescms-account': 'alice' } },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(200)
  expect(handler).toHaveBeenCalledOnce()
})

it('rejects cross-origin language writes before resolving services', async () => {
  const getServices = vi.fn()
  const response = await api.request(
    '/api/account/language',
    {
      method: 'PATCH',
      headers: {
        origin: 'https://other.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accountId: 'user', language: 'fr' }),
    },
    { publicBaseUrl: 'https://cms.test', getServices },
  )
  expect(response.status).toBe(403)
  expect(getServices).not.toHaveBeenCalled()
})

it('rejects a language write after the signed-in account changes', async () => {
  const execute = vi.fn()
  const services = {
    getSession: async () => ({ user: { id: 'other' } }),
    access: { execute },
  } as unknown as RequestServices
  const response = await api.request(
    'https://cms.test/api/account/language',
    {
      method: 'PATCH',
      headers: {
        origin: 'https://cms.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accountId: 'user', language: 'fr' }),
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(409)
  expect(execute).not.toHaveBeenCalled()
})

it('checks account policy before saving language', async () => {
  const executeSql = vi.fn(async () => ({
    rows: [{ preferences: '{"language":"fr"}' }],
  }))
  const database = { $client: { execute: executeSql } }
  const execute = vi.fn(
    async (_input: unknown, operation: () => Promise<unknown>) => operation(),
  )
  const services = {
    getSession: async () => ({ user: { id: 'user' } }),
    database,
    access: { execute },
    refreshSession: async () => {},
  } as unknown as RequestServices
  const response = await api.request(
    'https://cms.test/api/account/language',
    {
      method: 'PATCH',
      headers: {
        origin: 'https://cms.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accountId: 'user', language: 'fr' }),
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ language: 'fr' })
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'account.update',
      principal: { type: 'user', id: 'user' },
    }),
    expect.any(Function),
  )
  expect(executeSql).toHaveBeenCalledOnce()
})

it.each([
  [
    'action flags',
    '/api/actions?owner=owner&repo=site&branch=main&includeRuns=bad',
  ],
  [
    'media name',
    '/api/media?owner=owner&repo=site&branch=main&name=bad%2Fname',
  ],
  ['file name', '/api/files?owner=owner&repo=site&branch=main&name=bad%2Fname'],
  [
    'collection name',
    '/api/collections?owner=owner&repo=site&branch=main&name=invalid%2Fname',
  ],
  ['activity page', '/api/activity?owner=owner&repo=site&branch=main&page=-1'],
  [
    'configuration history page',
    '/api/configuration/history?owner=owner&repo=site&branch=main&page=-1',
  ],
])('rejects invalid %s before repository admission', async (_label, path) => {
  const resolve = vi.fn()
  const services = {
    getSession: async () => ({ user: { id: 'user' } }),
    repositoryAccess: { resolve },
  } as unknown as RequestServices
  const response = await api.request(
    path,
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(400)
  expect(resolve).not.toHaveBeenCalled()
})

it('denies collection reads when repository admission fails', async () => {
  const services = {
    getSession: async () => ({ user: { id: 'user' } }),
    access: { execute: vi.fn() },
    repositoryAccess: {
      resolve: async () => {
        throw new AccessDeniedError({
          allowed: false,
          reason: 'permission_denied',
        })
      },
    },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/collections?owner=owner&repo=site&branch=main&name=posts',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(403)
})

it('loads the workspace only after repository admission and policy checks', async () => {
  const user = {
    id: 'user',
    name: 'User',
    email: 'user@example.test',
    emailVerified: true,
  }
  const resolve = vi.fn(async () => ({ tokenSource: 'user' }))
  const openRepository = vi.fn(async () => ({
    repository: { id: 42, owner: 'owner', repo: 'site', canPush: true },
    configuration: null,
  }))
  const execute = vi.fn(
    async (
      _input: unknown,
      operation: (grant: undefined) => Promise<unknown>,
    ) => operation(undefined),
  )
  const services = {
    getSession: async () => ({ user }),
    repositoryAccess: { resolve },
    repositories: { openRepository },
    access: { execute },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/repository?owner=owner&repo=site&branch=main',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    repository: { id: 42 },
    configuration: null,
    canViewGitHub: true,
  })
  expect(resolve).toHaveBeenCalledOnce()
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'repository.read' }),
    expect.any(Function),
  )
  expect(openRepository).toHaveBeenCalledOnce()
})

it('retains workspace permission denials', async () => {
  const services = {
    getSession: async () => ({ user: { id: 'user' } }),
    repositoryAccess: {
      resolve: async () => {
        throw new AccessDeniedError({
          allowed: false,
          reason: 'permission_denied',
        })
      },
    },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/repository?owner=owner&repo=site',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({
    code: 'access_denied',
    reason: 'permission_denied',
  })
})

it('validates repository search and checks the installation policy', async () => {
  const listRepositories = vi.fn(async () => [])
  const execute = vi.fn(
    async (_input: unknown, operation: () => Promise<unknown>) => operation(),
  )
  const services = {
    getSession: async () => ({
      user: {
        id: 'user',
        name: 'User',
        email: 'user@example.test',
        emailVerified: true,
      },
    }),
    access: { execute },
    repositories: { listRepositories },
  } as unknown as RequestServices
  const bindings = {
    publicBaseUrl: 'https://cms.test',
    getServices: () => services,
  }
  const invalid = await api.request(
    '/api/repositories?login=owner',
    {},
    bindings,
  )
  expect(invalid.status).toBe(400)
  expect(listRepositories).not.toHaveBeenCalled()
  const response = await api.request(
    '/api/repositories?login=owner&type=org&repositorySelection=all&installationId=42&keyword=site',
    {},
    bindings,
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([])
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'repository.list',
      tenant: { type: 'installation', id: '42' },
    }),
    expect.any(Function),
  )
  expect(listRepositories).toHaveBeenCalledOnce()
})

it('requires a session before loading the dashboard', async () => {
  const services = {
    getSession: async () => null,
  } as unknown as RequestServices
  const response = await api.request(
    '/api/dashboard',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ code: 'authentication_required' })
})

it('preserves dashboard access-denial details', async () => {
  const services = {
    getSession: async () => ({ user: { id: 'user' } }),
    configuration: { adminEmails: [], auth: { baseUrl: 'https://cms.test' } },
    access: {
      execute: async () => {
        throw new AccessDeniedError({
          allowed: false,
          reason: 'feature_unavailable',
          actionUrl: '/billing',
        })
      },
    },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/dashboard',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({
    code: 'access_denied',
    reason: 'feature_unavailable',
    actionUrl: '/billing',
  })
})

it('returns authentication state without caching the response', async () => {
  const services = {
    getSession: async () => null,
    configuration: { adminEmails: [], auth: {}, defaultLanguage: 'en' },
    authenticationMethods: { email: true },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/session',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({
    locale: 'en',
    user: null,
    profileCompleted: false,
    isAdmin: false,
    methods: { github: false, google: false, email: true },
  })
})

it('returns the signed-in user and local account receipt', async () => {
  const services = {
    getSession: async () => ({
      user: {
        id: 'user',
        name: 'User',
        email: 'user@example.test',
        emailVerified: true,
        onboardingCompletedAt: new Date(),
      },
    }),
    configuration: {
      adminEmails: ['user@example.test'],
      auth: { secret: 'a-secure-auth-secret-with-32-characters' },
    },
    authenticationMethods: { email: true },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/session',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(await response.json()).toMatchObject({
    user: { id: 'user' },
    localDataReceipt: expect.any(String),
    profileCompleted: true,
    isAdmin: true,
  })
})

it('reports both database checks and preserves the request ID', async () => {
  const execute = vi.fn(async () => ({ rows: [{ 1: 1 }] }))
  const database = { $client: { execute } }
  const services = {
    database,
    cacheDatabase: database,
  } as unknown as RequestServices
  const response = await api.request(
    '/api/health',
    { headers: { 'x-request-id': 'test-1' } },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('x-request-id')).toBe('test-1')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({
    service: 'pagescms',
    status: 'ok',
    checks: { database: 'ok', cacheDatabase: 'ok' },
  })
  expect(execute).toHaveBeenCalledTimes(2)
})

it.each(['application', 'database', 'cacheDatabase'] as const)(
  'reports a failed %s check',
  async (failure) => {
    const error = new Error('unavailable')
    const makeDatabase = (fails: boolean) => ({
      $client: {
        execute: fails
          ? vi.fn().mockRejectedValue(error)
          : vi.fn().mockResolvedValue({ rows: [{ 1: 1 }] }),
      },
    })
    const services = {
      database: makeDatabase(failure === 'database'),
      cacheDatabase: makeDatabase(failure === 'cacheDatabase'),
    } as unknown as RequestServices
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await api.request(
      '/api/health',
      {},
      {
        publicBaseUrl: 'https://cms.test',
        getServices: () => {
          if (failure === 'application') throw error
          return services
        },
      },
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      service: 'pagescms',
      status: 'unavailable',
      checks: { [failure]: 'unavailable' },
    })
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  },
)

it('reports GitHub failures without retrying a different repository', async () => {
  const { GitHubApiError } = await import('#/server/github/api')
  const resolve = vi.fn(async () => {
    throw new GitHubApiError('Not Found', 404)
  })
  const services = {
    getSession: async () => ({ user: { id: 'user' } }),
    repositoryAccess: { resolve },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/repository?owner=owner&repo=site',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({
    code: 'operation_error',
    message: 'Not found',
  })
  expect(resolve).toHaveBeenCalledOnce()
})

it('uses the signed-in language preference before the browser cookie', async () => {
  const services = {
    getSession: async () => ({
      user: { id: 'user', preferences: { language: 'fr' } },
    }),
    configuration: {
      adminEmails: [],
      auth: { secret: 'test-only-auth-secret-at-least-32-characters' },
    },
    authenticationMethods: { email: false },
  } as unknown as RequestServices
  const response = await api.request(
    'https://cms.test/api/session',
    {
      headers: { cookie: 'pagescms-language=en', 'accept-language': 'en' },
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ locale: 'fr' })
})

it('rejects cross-origin configuration writes before accessing services', async () => {
  const getServices = vi.fn()
  const response = await api.request(
    'https://cms.test/api/configuration',
    {
      method: 'POST',
      headers: {
        origin: 'https://other.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        owner: 'owner',
        repo: 'site',
        branch: 'main',
        source: '',
        sha: null,
      }),
    },
    { publicBaseUrl: 'https://cms.test', getServices },
  )
  expect(response.status).toBe(403)
  expect(getServices).not.toHaveBeenCalled()
})

it('rejects cross-origin and invalid media delivery requests before repository access', async () => {
  const resolve = vi.fn()
  const services = {
    getSession: async () => ({ user: { id: 'user' } }),
    repositoryAccess: { resolve },
  } as unknown as RequestServices
  const call = (origin: string, paths: string[]) =>
    api.request(
      'https://cms.test/api/media/delivery',
      {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          'x-pagescms-account': 'user',
        },
        body: JSON.stringify({
          owner: 'owner',
          repo: 'site',
          branch: 'main',
          name: 'images',
          paths,
        }),
      },
      { publicBaseUrl: 'https://cms.test', getServices: () => services },
    )
  expect((await call('https://other.test', ['photo.png'])).status).toBe(403)
  expect((await call('https://cms.test', [])).status).toBe(400)
  expect(resolve).not.toHaveBeenCalled()
})
