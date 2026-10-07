import { describe, it, expect, vi } from 'vitest'
import { configuredCollaboratorBranches } from './configured-branches.server'
import type { RequestServices } from './request-services.server'

const get = vi.hoisted(() => vi.fn())
vi.mock('./configuration-store.server', () => ({
  createConfigurationStore: () => ({ get }),
}))
const user = {
  id: 'collaborator',
  email: 'editor@example.com',
  githubUsername: null,
}
function services(allowed: string[] = ['main', 'draft']) {
  const api = {
    getRepository: async () => ({ defaultBranch: 'main' }),
    listBranches: vi.fn(async () => ['draft', 'main', 'empty']),
    branchExists: async () => true,
  }
  return {
    cacheDatabase: {},
    repositoryAccess: {
      resolve: async () => ({ api, tokenSource: 'installation' }),
    },
    access: {
      discover: async (request: {
        resources: { type: 'branch'; name: string }[]
      }) => ({
        visibility: 'filtered',
        resources: request.resources.filter((resource) =>
          allowed.includes(resource.name),
        ),
      }),
    },
  } as unknown as RequestServices
}
describe('configured collaborator branches', () => {
  it('reuses one admission and avoids enumerating branches on ordinary configured navigation', async () => {
    get.mockClear().mockResolvedValue({ object: {} })
    const requestServices = services()
    const admission = await requestServices.repositoryAccess.resolve(
      user,
      'owner',
      'repo',
    )
    const resolve = vi
      .spyOn(requestServices.repositoryAccess, 'resolve')
      .mockResolvedValue(admission)
    expect(
      await configuredCollaboratorBranches(
        requestServices,
        user,
        { owner: 'owner', repo: 'repo' },
        'main',
        true,
      ),
    ).toEqual(['main'])
    expect(resolve).toHaveBeenCalledOnce()
    expect(admission.api.listBranches).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledOnce()
  })
  it('falls back from missing config to the authorized configured default, with deterministic ordering', async () => {
    get.mockImplementation(async (_api, _owner, _repo, branch) =>
      branch === 'main' ? { object: {} } : null,
    )
    expect(
      await configuredCollaboratorBranches(
        services(),
        user,
        { owner: 'owner', repo: 'repo' },
        'draft',
        true,
      ),
    ).toEqual(['main'])
  })
  it('never probes configuration on unauthorized branches', async () => {
    get.mockClear().mockImplementation(async () => ({ object: {} }))
    expect(
      await configuredCollaboratorBranches(
        services(['draft']),
        user,
        { owner: 'owner', repo: 'repo' },
        'main',
      ),
    ).toEqual(['draft'])
    expect(get.mock.calls.map((call) => call[3])).toEqual(['draft'])
  })
  it('distinguishes invalid configuration from a missing configuration', async () => {
    get.mockRejectedValue(new Error('Invalid .pages.yml'))
    await expect(
      configuredCollaboratorBranches(
        services(),
        user,
        { owner: 'owner', repo: 'repo' },
        'main',
        true,
      ),
    ).rejects.toThrow('Invalid .pages.yml')
  })
})
