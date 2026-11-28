import { expect, it, vi } from 'vitest'
import { withActivityCapture } from '#/server/activity/capture'
import { createAccessPolicyGateway } from '#/server/access/policy'
import { recordActivity } from '#/server/activity/store'
import type { Database } from '#/server/db/client'

vi.mock('#/server/access/repository-identity', () => ({
  findRepositoryIdentityByExternalId: vi.fn(async () => ({
    id: 1,
    externalId: '42',
    source: 'github.com',
  })),
  ensureRepositoryIdentity: vi.fn(),
}))
vi.mock('#/server/activity/store', () => ({ recordActivity: vi.fn() }))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({ find: async () => null }),
}))

it('schedules activity capture after a successful write without delaying its result', async () => {
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.mocked(recordActivity).mockReturnValueOnce(pending)
  const database = {
    $client: {
      execute: async () => ({ rows: [{ id: 'u', name: 'User', image: null }] }),
    },
  } as unknown as Database
  const waitUntil = vi.fn()
  const access = withActivityCapture(
    createAccessPolicyGateway({}),
    database,
    database,
    waitUntil,
  )
  const result = await access.execute(
    {
      operation: 'configuration.update',
      principal: {
        type: 'user',
        id: 'u',
        repositoryIdentity: { source: 'github.com', externalId: '42' },
      },
      tenant: { type: 'repository', id: 'owner/repo' },
      target: {
        repository: { owner: 'owner', repo: 'repo', repoId: '42' },
        branch: 'main',
        path: '.pages.yml',
      },
    },
    async () => ({ path: '.pages.yml', commitSha: 'sha' }),
  )
  expect(result).toEqual({ path: '.pages.yml', commitSha: 'sha' })
  expect(waitUntil).toHaveBeenCalledOnce()
  finish()
  await waitUntil.mock.calls[0][0]
  expect(recordActivity).toHaveBeenCalledOnce()
})
