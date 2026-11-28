import type * as RepositoryIdentityModule from '#/server/access/repository-identity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateRepositoryReads } from '#/server/cache/repository-read'
import { invalidateInstallationToken } from '#/server/github/installation-token-cache'

import { GitHubApiError } from '#/server/github/api'
import { createAccessPolicyGateway } from '#/server/access/policy'
import { createRepositoryAccessService } from '#/server/__tests__/credentials'
import { encryptSecret } from '#/server/auth/secret-crypto'

import type { Database } from '#/server/db/client'

beforeEach(() => {
  invalidateRepositoryReads('pagescms')
  invalidateInstallationToken(42)
})

const user = {
  id: 'user-1',
  email: 'editor@example.com',
  githubUsername: 'editor',
}

function repositoryResponse() {
  return Response.json({
    id: 10,
    owner: { id: 20, login: 'pagescms' },
    name: 'pagescms',
    default_branch: 'main',
    private: false,
    permissions: { push: true },
  })
}

function databaseWith(input: {
  account?: { accessToken: string | null } | null
  collaborator?: {
    email: string
    installationId: number
    branch?: string | null
  } | null
  cachedToken?: {
    ciphertext: string
    iv: string
    expiresAt: Date
  } | null
}) {
  const collaboratorFind = vi.fn(async () =>
    input.collaborator
      ? [{ repoId: '10', ownerId: '20', ...input.collaborator }]
      : [],
  )
  const database = {
    $client: {
      execute: vi.fn(async (statement: { sql: string }) => {
        if (statement.sql.includes('LEFT JOIN collaborator c')) {
          const collaborators = await collaboratorFind()
          return {
            rows: (collaborators.length ? collaborators : [null]).map(
              (row) => ({
                identityId: 1,
                externalId: '10',
                identityOwnerId: '20',
                identityOwner: 'pagescms',
                identityRepo: 'pagescms',
                id: row ? 1 : null,
                installationId: null,
                email: null,
                userId: row ? 'user-1' : null,
                repoId: null,
                ownerId: null,
                ...row,
              }),
            ),
          }
        }
        return {
          rows: statement.sql.includes('FROM collaborator')
            ? await collaboratorFind()
            : input.cachedToken
              ? [
                  {
                    ...input.cachedToken,
                    expiresAt: input.cachedToken.expiresAt.getTime(),
                  },
                ]
              : [],
        }
      }),
    },
    query: {
      accountTable: {
        findFirst: vi.fn(async () => input.account ?? null),
      },
      collaboratorTable: { findMany: collaboratorFind },
    },
  } as unknown as Database
  return { database, collaboratorFind }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('repository access', () => {
  it('refreshes cached GitHub permissions before admitting a mutation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(repositoryResponse())
      .mockResolvedValueOnce(
        Response.json({
          id: 10,
          owner: { id: 20, login: 'pagescms' },
          name: 'pagescms',
          default_branch: 'main',
          private: false,
          permissions: { push: false },
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    const { database } = databaseWith({
      account: { accessToken: 'ghu_fresh_mutation_test' },
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
    })
    await service.resolve(user, 'pagescms', 'pagescms')
    const operation = vi.fn()
    await expect(
      service.executeMutation(
        user,
        { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
        'single',
        operation,
      ),
    ).rejects.toThrow('do not have permission')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(operation).not.toHaveBeenCalled()
  })

  it('does not reuse an earlier positive repository cache after a fresh permission denial', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(repositoryResponse())
      .mockImplementation(async () =>
        Response.json({
          id: 10,
          owner: { id: 20, login: 'pagescms' },
          name: 'pagescms',
          default_branch: 'main',
          private: false,
          permissions: { push: false },
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    const { database } = databaseWith({
      account: { accessToken: 'ghu_fresh_denial_invalidates' },
    })
    const services = () =>
      createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: undefined,
      })
    const first = services()
    await first.resolve(user, 'pagescms', 'pagescms')
    await expect(
      first.executeMutation(
        user,
        { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
        'single',
        async () => {},
      ),
    ).rejects.toThrow('do not have permission')
    await expect(
      services().resolve(user, 'pagescms', 'pagescms'),
    ).rejects.toThrow('do not have permission')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('rejects reuse when an address now points to another repository', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => repositoryResponse()),
    )
    const { database } = databaseWith({
      account: { accessToken: 'ghu_replacement' },
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
    })
    await service.resolve(user, 'pagescms', 'pagescms')
    const identity = await import('#/server/access/repository-identity')
    const original = (await identity.findRepositoryIdentity(database, {
      owner: 'pagescms',
      repo: 'pagescms',
    }))!
    vi.spyOn(identity, 'findRepositoryIdentity').mockResolvedValue({
      ...original,
      id: 2,
      externalId: '11',
    })
    await expect(
      service.resolve(user, 'pagescms', 'pagescms', 'main', '11'),
    ).rejects.toThrow('identity does not match')
    expect(
      (await service.resolve(user, 'pagescms', 'pagescms', 'main', '10'))
        .identity?.externalId,
    ).toBe('10')
  })

  it('keeps subsequent repository reads bound to the admitted ID', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes('/contents/')
        ? Response.json({ type: 'file', sha: 'blob', content: btoa('hello') })
        : repositoryResponse(),
    )
    vi.stubGlobal('fetch', fetcher)
    const { database } = databaseWith({
      account: { accessToken: 'ghu_id_bound' },
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
    })
    const admission = await service.resolve(user, 'pagescms', 'pagescms')
    await admission.api.getFile('pagescms', 'pagescms', 'hello.md', 'main')
    expect(String(fetcher.mock.calls[1][0])).toContain(
      '/repositories/10/contents/hello.md',
    )
  })

  it('keeps the admitted ID when an address changes during admission', async () => {
    let finish!: (response: Response) => void
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const { database } = databaseWith({
      account: { accessToken: 'ghu_inflight_identity' },
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
    })
    const pending = service.resolve(user, 'pagescms', 'pagescms', 'main', '10')
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    const identity = await import('#/server/access/repository-identity')
    const original = await identity.ensureRepositoryIdentity(database, {
      owner: 'pagescms',
      repo: 'pagescms',
    })
    const lookup = vi
      .spyOn(identity, 'ensureRepositoryIdentity')
      .mockResolvedValue({ ...original, id: 2, externalId: '11' })
    finish(repositoryResponse())
    const admission = await pending
    expect(admission.identity?.externalId).toBe('10')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('prefers a user token that can access the repository', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        repositoryResponse(),
    )
    vi.stubGlobal('fetch', fetcher)
    const { database, collaboratorFind } = databaseWith({
      account: { accessToken: 'ghu_user' },
    })

    const access = await createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
    }).resolve(user, 'pagescms', 'pagescms', 'main')

    expect(access.tokenSource).toBe('user')
    expect(collaboratorFind).not.toHaveBeenCalled()
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'),
    ).toBe('Bearer ghu_user')
  })

  it('decrypts a cached installation token for an authorized collaborator', async () => {
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
    const encrypted = await encryptSecret('ghs_installation', cryptoKey)
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        repositoryResponse(),
    )
    vi.stubGlobal('fetch', fetcher)
    const { database } = databaseWith({
      account: null,
      collaborator: { email: 'editor@example.com', installationId: 42 },
      cachedToken: {
        ...encrypted,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    })

    const access = await createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: {
        appId: '123',
        privateKey: 'unused-for-a-cached-token',
        cryptoKey,
      },
    }).resolve(
      { ...user, githubUsername: null },
      'pagescms',
      'pagescms',
      'main',
    )
    await access.api.getRepository('pagescms', 'pagescms')

    expect(access.tokenSource).toBe('installation')
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'),
    ).toBe('Bearer ghs_installation')
  })

  it('blocks a revoked collaborator even when the installation token is cached', async () => {
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
    const encrypted = await encryptSecret('ghs_installation', cryptoKey)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => repositoryResponse()),
    )
    const { database, collaboratorFind } = databaseWith({
      account: null,
      collaborator: { email: 'editor@example.com', installationId: 42 },
      cachedToken: { ...encrypted, expiresAt: new Date(Date.now() + 600_000) },
    })
    const makeService = () =>
      createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: { appId: '123', privateKey: 'unused', cryptoKey },
      })
    const collaborator = { ...user, githubUsername: null }
    await expect(
      makeService().resolve(collaborator, 'pagescms', 'pagescms', 'main'),
    ).resolves.toMatchObject({ tokenSource: 'installation' })
    collaboratorFind.mockResolvedValueOnce([])
    await expect(
      makeService().resolve(collaborator, 'pagescms', 'pagescms', 'main'),
    ).rejects.toThrow()
  })

  it('rejects collaborator admission when GitHub reports a replacement repository', async () => {
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
    const encrypted = await encryptSecret('ghs_installation', cryptoKey)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          id: 11,
          owner: { id: 20, login: 'pagescms' },
          name: 'pagescms',
          default_branch: 'main',
          private: false,
          permissions: { push: true },
        }),
      ),
    )
    const { database } = databaseWith({
      account: null,
      collaborator: { email: 'editor@example.com', installationId: 42 },
      cachedToken: { ...encrypted, expiresAt: new Date(Date.now() + 600000) },
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: { appId: '123', privateKey: 'unused', cryptoKey },
    })
    await expect(
      service.resolve(user, 'pagescms', 'pagescms', 'main', '10'),
    ).rejects.toThrow('address changed')
  })

  it('denies users with neither direct nor collaborator access', async () => {
    const { database } = databaseWith({ account: null, collaborator: null })
    await expect(
      createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: undefined,
      }).resolve(user, 'private-owner', 'private-repo'),
    ).rejects.toThrow('do not have permission')
  })

  it('still observes the canonical identity when a collaborator uses an alias', async () => {
    const identity = await import('#/server/access/repository-identity')
    const observe = vi.spyOn(identity, 'observeRepositoryIdentity')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => repositoryResponse()),
    )
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
    const encrypted = await encryptSecret('ghs_collaborator_alias', cryptoKey)
    const { database } = databaseWith({
      collaborator: { email: 'editor@example.com', installationId: 42 },
      cachedToken: { ...encrypted, expiresAt: new Date(Date.now() + 600_000) },
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: { appId: '123', privateKey: 'unused', cryptoKey },
    })
    await service.resolve(user, 'former-owner', 'former-repo', 'main')
    expect(observe).toHaveBeenCalledOnce()
  })

  describe('rate limits', () => {
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
    const githubApp = {
      appId: '123',
      privateKey: 'unused-for-cached-token',
      cryptoKey,
    }

    // Every case has a usable collaborator fallback, so a wrong fallback
    // would succeed with the installation token instead of rejecting.
    async function setup(accessToken: string) {
      const encrypted = await encryptSecret('ghs_installation', cryptoKey)
      const { database, collaboratorFind } = databaseWith({
        account: { accessToken },
        collaborator: { email: 'editor@example.com', installationId: 42 },
        cachedToken: { ...encrypted, expiresAt: new Date(Date.now() + 600000) },
      })
      const service = createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp,
      })
      return { service, collaboratorFind }
    }

    const throttled = [
      [
        'primary',
        Response.json(
          { message: 'API rate limit exceeded' },
          {
            status: 403,
            headers: {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': '1700000000',
            },
          },
        ),
      ],
      [
        'secondary without headers',
        Response.json(
          { message: 'You have exceeded a secondary rate limit.' },
          { status: 403 },
        ),
      ],
      [
        'retry-after',
        Response.json(
          { message: 'Forbidden' },
          { status: 403, headers: { 'retry-after': '60' } },
        ),
      ],
      ['429', Response.json({ message: 'Too many requests' }, { status: 429 })],
    ] as const

    it.each(throttled)(
      'propagates a %s rate limit without choosing collaborator credentials',
      async (name, response) => {
        const fetcher = vi
          .fn<
            (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
          >()
          .mockResolvedValueOnce(response)
          .mockImplementation(async () => repositoryResponse())
        vi.stubGlobal('fetch', fetcher)
        const token = `ghu_resolve_${name}`
        const { service, collaboratorFind } = await setup(token)

        await expect(
          service.resolve(user, 'pagescms', 'pagescms'),
        ).rejects.toMatchObject({ status: response.status })
        expect(collaboratorFind).not.toHaveBeenCalled()

        // The failure is neither cached nor remembered as an installation choice.
        const access = await service.resolve(user, 'pagescms', 'pagescms')
        expect(access.tokenSource).toBe('user')
        await service.executeMutation(
          user,
          { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
          'single',
          async () => {
            const pinned = await service.resolve(user, 'pagescms', 'pagescms')
            expect(pinned.tokenSource).toBe('user')
          },
        )
        expect(collaboratorFind).not.toHaveBeenCalled()
        for (const call of fetcher.mock.calls)
          expect(new Headers(call[1]?.headers).get('authorization')).toBe(
            `Bearer ${token}`,
          )
      },
    )

    it('propagates a mutation 404 without a follow-up probe', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn(async () =>
            Response.json(
              { message: 'You have exceeded a secondary rate limit.' },
              { status: 403 },
            ),
          )
          .mockResolvedValueOnce(repositoryResponse()),
      )
      const { service, collaboratorFind } = await setup('ghu_probe_limited')
      const now = Date.now()
      const operation = vi.fn(async () => {
        vi.spyOn(Date, 'now').mockReturnValue(now + 60_000)
        throw new GitHubApiError('Not Found', 404)
      })

      await expect(
        service.executeMutation(
          user,
          { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
          'single',
          operation,
        ),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Not Found',
      })
      expect(operation).toHaveBeenCalledOnce()
      expect(collaboratorFind).not.toHaveBeenCalled()
      vi.restoreAllMocks()
    })

    it('propagates a rate-limited mutation without retrying as a collaborator', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => repositoryResponse()),
      )
      const { service, collaboratorFind } = await setup('ghu_write_limited')
      const operation = vi.fn(async () => {
        throw new GitHubApiError('Not authorized', 401, '60')
      })

      await expect(
        service.executeMutation(
          user,
          { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
          'single',
          operation,
        ),
      ).rejects.toMatchObject({ status: 401, retryAfter: '60' })
      expect(operation).toHaveBeenCalledOnce()
      expect(collaboratorFind).not.toHaveBeenCalled()
    })

    it('still falls back to collaborator access when the user token lost access', async () => {
      const fetcher = vi
        .fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >()
        .mockResolvedValueOnce(
          Response.json({ message: 'Not Found' }, { status: 404 }),
        )
        .mockImplementation(async () => repositoryResponse())
      vi.stubGlobal('fetch', fetcher)
      const { service, collaboratorFind } = await setup('ghu_lost_access')

      const access = await service.resolve(user, 'pagescms', 'pagescms')
      expect(access.tokenSource).toBe('installation')
      expect(collaboratorFind).toHaveBeenCalledOnce()
    })

    it('retries the user token when a remembered collaborator membership is revoked', async () => {
      const fetcher = vi
        .fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >()
        .mockResolvedValueOnce(
          Response.json({ message: 'Not Found' }, { status: 404 }),
        )
        .mockImplementation(async () => repositoryResponse())
      vi.stubGlobal('fetch', fetcher)
      const { service, collaboratorFind } = await setup(
        'ghu_hint_revoked_regression',
      )
      expect(
        (await service.resolve(user, 'pagescms', 'pagescms')).tokenSource,
      ).toBe('installation')
      collaboratorFind.mockResolvedValueOnce([])
      const result = await service.executeMutation(
        user,
        { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
        'single',
        async () =>
          (await service.resolve(user, 'pagescms', 'pagescms')).tokenSource,
      )
      expect(result).toBe('user')
    })

    it('does not retry a failed mutation as a collaborator', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => repositoryResponse()),
      )
      const { service, collaboratorFind } = await setup('ghu_write_lost')
      const sources: string[] = []
      await expect(
        service.executeMutation(
          user,
          { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
          'single',
          async () => {
            const access = await service.resolve(user, 'pagescms', 'pagescms')
            sources.push(access.tokenSource)
            if (access.tokenSource === 'user')
              throw new GitHubApiError(
                'Resource not accessible by integration',
                403,
              )
            return 'saved'
          },
        ),
      ).rejects.toMatchObject({ status: 403 })

      expect(sources).toEqual(['user'])
      expect(collaboratorFind).not.toHaveBeenCalled()
    })

    it('does not invoke another policy after an ID-bound write fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => repositoryResponse()),
      )
      const { service } = await setup('ghu_write_fallback_policy')
      const decisions: string[] = []
      const gateway = createAccessPolicyGateway({
        policy: {
          authorize: async (request) => {
            decisions.push(request.principal.type)
            return request.principal.type === 'user'
              ? { allowed: true }
              : { allowed: false, reason: 'permission_denied' }
          },
        },
      })
      const write = vi.fn(async () => {
        throw new GitHubApiError('Resource not accessible by integration', 403)
      })
      await expect(
        service.executeMutation(
          user,
          { owner: 'pagescms', repo: 'pagescms', branch: 'main' },
          'single',
          async () => {
            const admission = await service.resolve(
              user,
              'pagescms',
              'pagescms',
            )
            await gateway.authorize({
              operation: 'entry.update',
              principal: {
                type:
                  admission.tokenSource === 'user' ? 'user' : 'collaborator',
                id: user.id,
              },
              tenant: { type: 'repository', id: 'repo' },
            })
            await write()
          },
        ),
      ).rejects.toMatchObject({ status: 403 })
      expect(decisions).toEqual(['user'])
      expect(write).toHaveBeenCalledOnce()
    })
  })
})

vi.mock('#/server/access/repository-identity', async (original) => ({
  ...(await original<typeof RepositoryIdentityModule>()),
  findRepositoryIdentityById: async () => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    owner: 'owner',
    repo: 'repo',
  }),
  findRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  ensureRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  observeRepositoryIdentity: async () => ({ id: 1 }),
}))
