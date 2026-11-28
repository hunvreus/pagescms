import { describe, expect, it, vi } from 'vitest'
import { createConfigurationStore } from '#/server/cache/configuration'
import type { Database } from '#/server/db/client'
import type { RepositoryApi } from '#/server/repository/provider'
import { CONFIGURATION_VERSION } from '#/shared/configuration'

function fixture(object: string) {
  const row = {
    repositoryId: 42,
    source: 'github.com',
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    sha: `config-${object}`,
    version: 'test-version',
    object,
    lastCheckedAt: new Date(123),
  }
  const database = {
    $client: {
      execute: vi.fn(async () => ({
        rows: [{ ...row, lastCheckedAt: row.lastCheckedAt.getTime() }],
      })),
    },
  } as unknown as Database
  return { store: createConfigurationStore({ database }), row }
}

describe('stored configuration reads', () => {
  it('uses an old cached configuration without checking the provider', async () => {
    const { store, row } = fixture('{"content":[]}')
    row.version = CONFIGURATION_VERSION
    row.sha = 'config-sha'
    const api = { getFile: vi.fn() } as unknown as RepositoryApi
    await expect(
      store.get(api, 'owner', 'repo', 'main', '42', {
        id: 42,
        externalId: '42',
        source: 'github.com',
      }),
    ).resolves.toMatchObject({ sha: 'config-sha', object: { content: [] } })
    expect(api.getFile).not.toHaveBeenCalled()
  })
  it('returns a stale configuration while checking GitHub in the background', async () => {
    const row = {
      repositoryId: 42,
      source: 'github.com',
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      sha: 'stale-sha',
      version: CONFIGURATION_VERSION,
      object: '{"content":[]}',
      lastCheckedAt: 123,
    }
    const database = {
      $client: { execute: vi.fn(async () => ({ rows: [row] })) },
    } as unknown as Database
    let finish!: () => void
    const pending = new Promise<never>((_, reject) => {
      finish = () => reject(new Error('GitHub unavailable'))
    })
    const waitUntil = vi.fn()
    const store = createConfigurationStore({
      database,
      waitUntil,
      readFile: () => pending,
    })
    const api = {} as RepositoryApi
    const result = await store.get(api, 'owner', 'repo', 'main', '42', {
      id: 42,
      externalId: '42',
      source: 'github.com',
    })
    expect(result?.sha).toBe('stale-sha')
    expect(waitUntil).toHaveBeenCalledOnce()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    finish()
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('configuration_background_refresh_failed'),
    )
    log.mockRestore()
  })
  it.each(['null', '[]', 'true', '42', '"text"'])(
    'rejects stored JSON that is not an object: %s',
    async (value) => {
      const { store } = fixture(value)
      await expect(store.find('owner', 'repo', 'main')).rejects.toThrow(
        'Expected a JSON object',
      )
    },
  )

  it('rejects malformed stored JSON', async () => {
    const { store } = fixture('{')
    await expect(store.find('owner', 'repo', 'main')).rejects.toThrow(
      SyntaxError,
    )
  })
})
