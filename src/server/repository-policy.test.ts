import { describe, expect, it, vi } from 'vitest'

import { resolveRepositoryPrincipal } from './repository-policy.server'

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
})
