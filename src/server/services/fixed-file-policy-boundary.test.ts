import { describe, it, expect, vi } from 'vitest'
import { api } from '#/server/routes/index'
import { createAccessPolicyGateway } from '#/server/access/policy'
import type { AccessRequest } from '#/server/access/policy'
import type { RequestServices } from '#/server/context'

const loadFixedFile = vi.hoisted(() =>
  vi.fn(async () => ({ path: 'data/settings.json' })),
)
const saveRawEntry = vi.hoisted(() =>
  vi.fn(async () => ({ path: 'data/settings.json' })),
)
vi.mock('#/server/content/entry-editor', () => ({
  loadFixedFile,
  saveRawEntry,
}))
describe('fixed-file authorization boundaries', () => {
  it('sends the fixed schema name through read/update policy and denies other names before provider reads', async () => {
    const requests: AccessRequest[] = []
    const access = createAccessPolicyGateway({
      required: true,
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
    const read = (data: {
      owner: string
      repo: string
      branch: string
      name: string
    }) => {
      const query = new URLSearchParams(data)
      return api.request(
        `https://cms.test/api/files?${query}`,
        {},
        {
          publicBaseUrl: 'https://cms.test',
          getServices: () => services as unknown as RequestServices,
        },
      )
    }
    const ref = {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      name: 'settings',
    }
    expect((await read(ref)).status).toBe(200)
    const response = await api.request(
      'https://cms.test/api/entries/raw',
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: 'https://cms.test',
          'x-pagescms-account': 'collaborator',
        },
        body: JSON.stringify({
          ...ref,
          path: 'data/settings.json',
          sha: 'sha',
          source: '{}',
        }),
      },
      {
        publicBaseUrl: 'https://cms.test',
        getServices: () => services as unknown as RequestServices,
      },
    )
    expect(response.status).toBe(200)
    expect((await read({ ...ref, name: 'secret' })).status).toBe(403)
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
