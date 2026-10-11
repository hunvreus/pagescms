import { describe, expect, it, vi } from 'vitest'
import { getConfigurationHistory } from './configuration-editor'
import { createAccessPolicyGateway } from '#/server/access-policy.server'

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

const read = getConfigurationHistory as unknown as (input: {
  context: unknown
  data: unknown
}) => Promise<unknown>
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
      deployment: 'hosted',
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
  it('reads only .pages.yml on the requested branch through the configuration policy', async () => {
    const f = fixture(true)
    await expect(read({ context: f.context, data })).resolves.toEqual([
      { sha: 'commit' },
    ])
    expect(f.listFileCommits).toHaveBeenCalledWith(
      'owner',
      'repo',
      'preview',
      '.pages.yml',
    )
    expect(f.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'configuration.history',
        target: { repository: data, branch: 'preview', path: '.pages.yml' },
      }),
    )
  })
  it('does not retrieve commits when policy denies access or authentication is missing', async () => {
    const f = fixture(false)
    await expect(read({ context: f.context, data })).rejects.toThrow(
      'permission_denied',
    )
    expect(f.listFileCommits).not.toHaveBeenCalled()
    f.services.getSession.mockResolvedValue(null)
    await expect(read({ context: f.context, data })).rejects.toThrow(
      'Authentication required',
    )
    expect(f.listFileCommits).not.toHaveBeenCalled()
  })
})
