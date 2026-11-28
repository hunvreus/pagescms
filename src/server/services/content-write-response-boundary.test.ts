import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccessPolicyGateway } from '#/server/access/policy'
import { api } from '#/server/routes/index'
import type { RequestServices } from '#/server/context'
import type { AccessRequest } from '#/server/access/policy'

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
vi.mock('#/server/content/entry-editor', () => ({
  saveRawEntry: save,
  saveStructuredEntry: save,
  createRawEntry: save,
  createStructuredEntry: save,
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
    'save-raw',
    { ...reference, path: 'posts/post.md', sha: 'old-sha', source: '{}' },
  ],
  [
    'structured save',
    'save-structured',
    {
      ...reference,
      path: 'posts/post.md',
      sha: 'old-sha',
      content: { title: 'Submitted' },
    },
  ],
  ['raw create', 'create-raw', { ...reference, parent: 'posts', source: '{}' }],
  [
    'structured create',
    'create-structured',
    { ...reference, parent: 'posts', content: { title: 'Submitted' } },
  ],
] as const
function setup(read: boolean | 'failure', write = true) {
  const requests: AccessRequest[] = []
  const access = createAccessPolicyGateway({
    required: true,
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
  return { services, requests }
}
function call(services: unknown, path: string, data: unknown) {
  return api.request(
    `https://cms.test/api/entries/${path.endsWith('raw') ? 'raw' : 'structured'}`,
    {
      method: path.startsWith('save') ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://cms.test',
        'x-pagescms-account': 'editor',
      },
      body: JSON.stringify(data),
    },
    {
      publicBaseUrl: 'https://cms.test',
      getServices: () => services as RequestServices,
    },
  )
}
beforeEach(() => save.mockClear())
describe('canonical write response authorization', () => {
  it.each(cases)(
    '%s cannot disclose merged content when read is denied',
    async (_label, path, data) => {
      const { services, requests } = setup(false)
      const response = await call(services, path, data)
      expect(response.status).toBe(200)
      const result = await response.json<{
        path: string
        sha: string
        entry?: unknown
      }>()
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
    const { services } = setup(true)
    const response = await call(services, 'save-structured', cases[1][2])
    expect(await response.json()).toEqual(committed)
  })
  it('keeps a confirmed write successful while failing closed if read policy fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { services } = setup('failure')
    const response = await call(services, 'save-structured', cases[1][2])
    const result = await response.json<{ sha: string; entry?: unknown }>()
    expect(result.sha).toBe('saved-sha')
    expect(result.entry).toBeUndefined()
    expect(save).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('content_write_response_read_failed'),
    )
    log.mockRestore()
  })
  it('still rejects insufficient write permission before the provider runs', async () => {
    const { services } = setup(true, false)
    expect((await call(services, 'save-structured', cases[1][2])).status).toBe(
      403,
    )
    expect(save).not.toHaveBeenCalled()
  })
})
