import { describe, it, expect, vi } from 'vitest'
import { getFixedFile } from './file-editor'
import { updateRawEntry } from './entry-editor'
import { createAccessPolicyGateway } from '#/server/access-policy.server'
import type { AccessRequest } from '#/server/access-policy.server'

const loadFixedFile = vi.hoisted(() =>
  vi.fn(async () => ({ path: 'data/settings.json' })),
)
const saveRawEntry = vi.hoisted(() =>
  vi.fn(async () => ({ path: 'data/settings.json' })),
)
vi.mock('#/server/entry-editor.server', () => ({ loadFixedFile, saveRawEntry }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validator: (data: unknown) => unknown) => ({
      handler:
        (handler: (input: unknown) => unknown) =>
        (input: { context: unknown; data: unknown }) =>
          handler({ ...input, data: validator(input.data) }),
    }),
  }),
}))
describe('fixed-file authorization boundaries', () => {
  it('sends the fixed schema name through read/update policy and denies other names before provider reads', async () => {
    const requests: AccessRequest[] = []
    const access = createAccessPolicyGateway({
      deployment: 'hosted',
      policy: {
        authorize: async (request) => {
          requests.push(request)
          return request.target?.collection === 'settings'
            ? { allowed: true }
            : { allowed: false, reason: 'permission_denied' }
        },
      },
    })
    const services = {
      access,
      getSession: async () => ({
        user: {
          id: 'collaborator',
          email: 'editor@example.com',
          emailVerified: true,
          githubUsername: null,
          name: 'Editor',
        },
      }),
      cacheDatabase: {},
      repositoryAccess: {
        resolve: vi
          .fn()
          .mockResolvedValue({ tokenSource: 'installation', api: {} }),
      },
    }
    const context = { getServices: () => services }
    const read = getFixedFile as unknown as (input: {
      context: unknown
      data: unknown
    }) => Promise<unknown>
    const write = updateRawEntry as unknown as typeof read
    const ref = {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      name: 'settings',
    }
    await read({ context, data: ref })
    await write({
      context,
      data: { ...ref, path: 'data/settings.json', sha: 'sha', source: '{}' },
    })
    await expect(
      read({ context, data: { ...ref, name: 'secret' } }),
    ).rejects.toThrow('permission_denied')
    expect(
      requests.slice(0, 2).map((request) => ({
        operation: request.operation,
        collection: request.target?.collection,
        principal: request.principal.type,
      })),
    ).toEqual([
      {
        operation: 'entry.read',
        collection: 'settings',
        principal: 'collaborator',
      },
      {
        operation: 'entry.update',
        collection: 'settings',
        principal: 'collaborator',
      },
    ])
    expect(loadFixedFile).toHaveBeenCalledTimes(1)
    expect(saveRawEntry).toHaveBeenCalledTimes(1)
  })
})
