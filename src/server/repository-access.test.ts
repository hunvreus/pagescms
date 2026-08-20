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
  collaborator?: { installationId: number } | null
  cachedToken?: {
    ciphertext: string
    iv: string
    expiresAt: Date
  } | null
}) {
  const collaboratorFind = vi.fn(async () => input.collaborator ?? null)
  const database = {
    query: {
      accountTable: {
        findFirst: vi.fn(async () => input.account ?? null),
      },
      collaboratorTable: { findFirst: collaboratorFind },
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

    const access = await createRepositoryAccessService(
      database,
      undefined,
    ).resolve(user, 'pagescms', 'pagescms', 'main')

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
      collaborator: { installationId: 42 },
      cachedToken: {
        ...encrypted,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    })

    const access = await createRepositoryAccessService(database, {
      appId: '123',
      privateKey: 'unused-for-a-cached-token',
      cryptoKey,
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
      createRepositoryAccessService(database, undefined).resolve(
        user,
        'private-owner',
        'private-repo',
      ),
    ).rejects.toThrow('do not have permission')
  })
})
