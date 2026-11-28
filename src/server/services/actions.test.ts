import { expect, it, vi } from 'vitest'
import { readActions, runRepositoryAction } from '#/server/services/actions'
import type { ServiceContext } from '#/server/services/context'

const f = vi.hoisted(() => ({ read: vi.fn(), run: vi.fn() }))
vi.mock('#/server/actions/actions', () => ({
  loadRepositoryActions: f.read,
  readActionRunStatuses: f.read,
  dispatchRepositoryAction: f.run,
}))
vi.mock('#/server/access/repository-policy', () => ({
  resolveRepositoryPrincipal: async () => ({
    type: 'collaborator',
    id: 'user',
    membershipId: '7',
    repositoryIdentity: {
      source: 'github.com',
      externalId: '42',
      ownerId: '20',
    },
  }),
}))

it('binds action reads and dispatches to the admitted ID without a client ID', async () => {
  f.read.mockResolvedValue({ actions: [], runs: [] })
  f.run.mockResolvedValue({})
  const services = {
    access: {
      execute: async (
        _request: unknown,
        operation: (grant: unknown) => Promise<unknown>,
      ) => operation({}),
      discover: async () => ({ visibility: 'all' }),
    },
    repositoryAccess: {},
    database: {},
    cacheDatabase: {},
  } as unknown as ServiceContext
  const user = {
    id: 'user',
    name: 'User',
    email: 'u@example.test',
    emailVerified: true,
    githubUsername: null,
  }
  const data = { owner: 'o', repo: 'r', branch: 'main' }
  await readActions(services, user, data)
  await runRepositoryAction(services, user, {
    ...data,
    actionName: 'build',
    inputs: {},
    context: { type: 'repository', name: null, path: null, data: {} },
  })
  expect(f.read).toHaveBeenCalledWith(expect.objectContaining({ repoId: '42' }))
  expect(f.run).toHaveBeenCalledWith(expect.objectContaining({ repoId: '42' }))
})
