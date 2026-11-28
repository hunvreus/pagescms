import { describe, expect, it, vi } from 'vitest'

import {
  resolveRepositoryPrincipal,
  requireRepositoryManager,
} from '#/server/access/repository-policy'

describe('repository policy principals', () => {
  const user = { id: 'user-1', email: 'user@example.com', githubUsername: null }
  const repository = { owner: 'pages-cms', repo: 'pagescms', branch: 'main' }

  it.each([
    ['user', 'user'],
    ['installation', 'collaborator'],
  ] as const)(
    'maps %s admission to %s authority',
    async (tokenSource, type) => {
      const resolve = vi.fn().mockResolvedValue({ api: {}, tokenSource })

      await expect(
        resolveRepositoryPrincipal({ resolve }, user, repository),
      ).resolves.toEqual({ type, id: user.id })
      expect(resolve).toHaveBeenCalledWith(
        user,
        'pages-cms',
        'pagescms',
        'main',
      )
    },
  )

  it('does not treat a linked GitHub username as direct access to an invited repository', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ api: {}, tokenSource: 'installation' })
    await expect(
      resolveRepositoryPrincipal(
        { resolve },
        { ...user, githubUsername: 'linked-user' },
        repository,
      ),
    ).resolves.toEqual({ type: 'collaborator', id: user.id })
  })

  it('carries the admitted repository and owner identity to policy evaluation', async () => {
    const resolve = vi.fn().mockResolvedValue({
      api: {},
      tokenSource: 'installation',
      membershipId: '7',
      repository: { id: 42, ownerId: 20 },
      identity: {
        applicationId: 1,
        cacheId: 2,
        externalId: '42',
        source: 'github.com',
      },
    })
    await expect(
      resolveRepositoryPrincipal({ resolve }, user, repository),
    ).resolves.toMatchObject({
      type: 'collaborator',
      membershipId: '7',
      repositoryIdentity: {
        source: 'github.com',
        externalId: '42',
        ownerId: '20',
      },
    })
  })
})

it('reuses verified request admission for manager reads and still rejects denied metadata', async () => {
  const getRepository = vi.fn()
  const repository = { id: 1, canPush: true }
  const resolve = vi.fn().mockResolvedValue({
    api: { getRepository },
    tokenSource: 'user',
    repository,
  })
  const user = { id: 'u', email: 'u@example.com', githubUsername: 'u' }
  const coordinates = { owner: 'o', repo: 'r', branch: 'main' }
  expect(
    (await requireRepositoryManager({ resolve }, user, coordinates)).repository,
  ).toBe(repository)
  expect(getRepository).not.toHaveBeenCalled()
  resolve.mockResolvedValue({
    api: { getRepository },
    tokenSource: 'user',
    repository: { ...repository, canPush: false },
  })
  await expect(
    requireRepositoryManager({ resolve }, user, coordinates),
  ).rejects.toThrow('write access')
})
