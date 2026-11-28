import { describe, expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import { createAccessPolicyGateway } from '#/server/access/policy'
import type { RequestServices } from '#/server/context'

function read(input: {
  context: { getServices: () => unknown }
  data: Record<string, string | number>
}) {
  const params = new URLSearchParams(
    Object.entries(input.data).map(([key, value]) => [key, String(value)]),
  )
  return api.request(
    `https://cms.test/api/configuration/history?${params}`,
    {},
    {
      publicBaseUrl: 'https://cms.test',
      getServices: () => input.context.getServices() as RequestServices,
    },
  )
}
const data = { owner: 'owner', repo: 'repo', branch: 'preview' }

function fixture(allowed: boolean) {
  const listFileCommits = vi.fn().mockResolvedValue([{ sha: 'commit' }])
  const authorize = vi
    .fn()
    .mockResolvedValue(
      allowed
        ? { allowed: true }
        : { allowed: false, reason: 'permission_denied' },
    )
  const services = {
    getSession: vi.fn().mockResolvedValue({
      user: {
        id: 'user',
        email: 'user@example.com',
        emailVerified: true,
        githubUsername: 'user',
      },
    }),
    access: createAccessPolicyGateway({
      required: true,
      policy: { authorize },
    }),
    repositoryAccess: {
      resolve: vi
        .fn()
        .mockResolvedValue({ tokenSource: 'user', api: { listFileCommits } }),
    },
  }
  return {
    context: { getServices: () => services },
    services,
    listFileCommits,
    authorize,
  }
}

describe('configuration history', () => {
  it('keeps the repository identity for both authorization and the history read', async () => {
    const f = fixture(true)
    await read({ context: f.context, data: { ...data, repoId: '10' } })
    expect(f.services.repositoryAccess.resolve).toHaveBeenCalledTimes(2)
    expect(f.services.repositoryAccess.resolve).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'user' }),
      'owner',
      'repo',
      'preview',
      '10',
    )
    expect(f.services.repositoryAccess.resolve).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'user' }),
      'owner',
      'repo',
      'preview',
      '10',
    )
  })

  it('reads only .pages.yml on the requested branch through the configuration policy', async () => {
    const f = fixture(true)
    const response = await read({ context: f.context, data })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ sha: 'commit' }])
    expect(f.listFileCommits).toHaveBeenCalledWith(
      'owner',
      'repo',
      'preview',
      '.pages.yml',
      1,
    )
    expect(f.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'configuration.history',
        target: { repository: data, branch: 'preview', path: '.pages.yml' },
      }),
    )
  })
  it('passes the requested page without changing the authorization target', async () => {
    const f = fixture(true)
    await read({ context: f.context, data: { ...data, page: 3 } })
    expect(f.listFileCommits).toHaveBeenCalledWith(
      'owner',
      'repo',
      'preview',
      '.pages.yml',
      3,
    )
    expect(f.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { repository: data, branch: 'preview', path: '.pages.yml' },
      }),
    )
  })
  it('rejects invalid history pages before querying the repository', async () => {
    const f = fixture(true)
    expect(
      (await read({ context: f.context, data: { ...data, page: -1 } })).status,
    ).toBe(400)
    expect(f.listFileCommits).not.toHaveBeenCalled()
  })
  it('does not retrieve commits when policy denies access or authentication is missing', async () => {
    const f = fixture(false)
    expect((await read({ context: f.context, data })).status).toBe(403)
    expect(f.listFileCommits).not.toHaveBeenCalled()
    f.services.getSession.mockResolvedValue(null)
    expect((await read({ context: f.context, data })).status).toBe(401)
    expect(f.listFileCommits).not.toHaveBeenCalled()
  })
})
