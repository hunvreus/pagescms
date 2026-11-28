import { describe, expect, it, vi } from 'vitest'
import { createConfigurationReader } from '#/server/cache/configuration-read'
import type { RepositoryApi } from '#/server/repository/provider'

describe('request-scoped configuration reads', () => {
  it('reuses one read for the same credential and branch only', async () => {
    const getFile = vi.fn().mockResolvedValue({ sha: 'one', content: 'eA==' })
    const api = { getFile } as unknown as RepositoryApi
    const otherApi = { getFile } as unknown as RepositoryApi
    const reader = createConfigurationReader()
    await reader.read(api, 'owner', 'repo', 'main')
    await reader.read(api, 'owner', 'repo', 'main')
    await reader.read(api, 'owner', 'repo', 'other')
    await reader.read(otherApi, 'owner', 'repo', 'main')
    await createConfigurationReader().read(api, 'owner', 'repo', 'main')
    expect(getFile).toHaveBeenCalledTimes(4)
    reader.clear()
    await reader.read(api, 'owner', 'repo', 'main')
    expect(getFile).toHaveBeenCalledTimes(5)
  })

  it('allows a failed read to be retried', async () => {
    const getFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ sha: 'one', content: 'eA==' })
    const api = { getFile } as unknown as RepositoryApi
    const reader = createConfigurationReader()
    await expect(reader.read(api, 'owner', 'repo', 'main')).rejects.toThrow(
      'offline',
    )
    await expect(
      reader.read(api, 'owner', 'repo', 'main'),
    ).resolves.toMatchObject({ sha: 'one' })
    expect(getFile).toHaveBeenCalledTimes(2)
  })
})
