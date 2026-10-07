import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRepositoryAccessService } from './repository-access.server'
import { encryptSecret } from './secret-crypto.server'

import type { Database } from './database/client.server'

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
    input.collaborator ? [{ branch: null, ...input.collaborator }] : [],
  )
  const database = {
    query: {
      accountTable: {
        findFirst: vi.fn(async () => input.account ?? null),
      },
      collaboratorTable: { findMany: collaboratorFind },
      githubInstallationTokenTable: {
        findFirst: vi.fn(async () => input.cachedToken ?? null),
      },
    },
  } as unknown as Database
  return { database, collaboratorFind }
}

afterEach(() => vi.unstubAllGlobals())

describe('repository access', () => {
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
  it('reuses repository admission without widening an existing core branch scope', async () => {
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
    const encrypted = await encryptSecret('ghs_installation', cryptoKey)
    const { database, collaboratorFind } = databaseWith({
      collaborator: {
        email: 'editor@example.com',
        installationId: 42,
        branch: 'main',
      },
      cachedToken: { ...encrypted, expiresAt: new Date(Date.now() + 600000) },
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: {
        appId: '123',
        privateKey: 'unused-for-cached-token',
        cryptoKey,
      },
    })
    const admission = await service.resolve(
      { ...user, githubUsername: null },
      'pagescms',
      'pagescms',
    )
    expect(admission.branches).toEqual(['main'])
    expect(
      await service.resolve(
        { ...user, githubUsername: null },
        'pagescms',
        'pagescms',
        'main',
      ),
    ).toBe(admission)
    await expect(
      service.resolve(
        { ...user, githubUsername: null },
        'pagescms',
        'pagescms',
        'draft',
      ),
    ).rejects.toThrow('do not have permission')
    expect(collaboratorFind).toHaveBeenCalledTimes(1)
  })
})
