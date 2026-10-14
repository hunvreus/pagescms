import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccessPolicyGateway } from '#/server/access-policy.server'
import {
  createRawCollectionEntry,
  createStructuredCollectionEntry,
  updateRawEntry,
  updateStructuredEntry,
} from './entry-editor'
import type { AccessRequest } from '#/server/access-policy.server'

const committed = vi.hoisted(() => ({
  path: 'posts/post.md',
  sha: 'saved-sha',
  entry: {
    path: 'posts/post.md',
    source: 'private merged value',
    content: { unmanaged: 'private merged value' },
  },
}))
const save = vi.hoisted(() => vi.fn(async () => committed))
vi.mock('#/server/entry-editor.server', () => ({
  saveRawEntry: save,
  saveStructuredEntry: save,
  createRawEntry: save,
  createStructuredEntry: save,
}))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validate: (data: unknown) => unknown) => ({
      handler:
        (handler: (input: unknown) => unknown) =>
        (input: { context: unknown; data: unknown }) =>
          handler({ ...input, data: validate(input.data) }),
    }),
  }),
}))
const reference = {
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  name: 'posts',
}
const cases = [
  [
    'raw save',
    updateRawEntry,
    { ...reference, path: 'posts/post.md', sha: 'old-sha', source: '{}' },
  ],
  [
    'structured save',
    updateStructuredEntry,
    {
      ...reference,
      path: 'posts/post.md',
      sha: 'old-sha',
      content: { title: 'Submitted' },
    },
  ],
  [
    'raw create',
    createRawCollectionEntry,
    { ...reference, parent: 'posts', source: '{}' },
  ],
  [
    'structured create',
    createStructuredCollectionEntry,
    { ...reference, parent: 'posts', content: { title: 'Submitted' } },
  ],
] as const
function setup(read: boolean | 'failure', write = true) {
  const requests: AccessRequest[] = []
  const access = createAccessPolicyGateway({
    deployment: 'hosted',
    policy: {
      authorize: async (request) => {
        requests.push(request)
        if (request.operation === 'entry.read' && read === 'failure')
          throw new Error('Policy unavailable')
        return (request.operation === 'entry.read' ? read : write)
          ? { allowed: true }
          : { allowed: false, reason: 'permission_denied' }
      },
    },
  })
  const services = {
    access,
    getSession: async () => ({
      user: {
        id: 'editor',
        email: 'editor@example.com',
        emailVerified: true,
        githubUsername: null,
        name: 'Editor',
      },
    }),
    cacheDatabase: {},
    repositoryAccess: {
      executeMutation: async (
        _user: unknown,
        _repository: unknown,
        _kind: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
      resolve: vi
        .fn()
        .mockResolvedValue({ tokenSource: 'installation', api: {} }),
    },
  }
  return { context: { getServices: () => services }, requests }
}
beforeEach(() => save.mockClear())
describe('canonical write response authorization', () => {
  it.each(cases)(
    '%s cannot disclose merged content when read is denied',
    async (_label, operation, data) => {
      const { context, requests } = setup(false)
      const call = operation as unknown as (input: {
        context: unknown
        data: unknown
      }) => Promise<{ path: string; sha: string; entry?: unknown }>
      const result = await call({ context, data })
      expect(result).toMatchObject({ path: 'posts/post.md', sha: 'saved-sha' })
      expect(result.entry).toBeUndefined()
      expect(save).toHaveBeenCalledTimes(1)
      expect(requests.at(-1)).toMatchObject({
        operation: 'entry.read',
        target: { collection: 'posts', path: 'posts/post.md' },
      })
    },
  )
  it('returns full confirmed data for an authorized reader', async () => {
    const { context } = setup(true)
    const call = updateStructuredEntry as unknown as (input: {
      context: unknown
      data: unknown
    }) => Promise<unknown>
    expect(await call({ context, data: cases[1][2] })).toEqual(committed)
  })
  it('keeps a confirmed write successful while failing closed if read policy fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { context } = setup('failure')
    const call = updateStructuredEntry as unknown as (input: {
      context: unknown
      data: unknown
    }) => Promise<{ sha: string; entry?: unknown }>
    const result = await call({ context, data: cases[1][2] })
    expect(result.sha).toBe('saved-sha')
    expect(result.entry).toBeUndefined()
    expect(save).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('content_write_response_read_failed'),
    )
    log.mockRestore()
  })
  it('still rejects insufficient write permission before the provider runs', async () => {
    const { context } = setup(true, false)
    const call = updateStructuredEntry as unknown as (input: {
      context: unknown
      data: unknown
    }) => Promise<unknown>
    await expect(call({ context, data: cases[1][2] })).rejects.toThrow(
      'permission_denied',
    )
    expect(save).not.toHaveBeenCalled()
  })
})
