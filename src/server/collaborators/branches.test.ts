import { describe, expect, it, vi } from 'vitest'
import { collaboratorBranches } from './branches'
import type { RequestServices } from '#/server/context'

const user = {
  id: 'collaborator',
  email: 'editor@example.com',
  githubUsername: null,
}
function services(allowed: string[]) {
  const api = {
    getRepository: vi.fn(async () => ({ defaultBranch: 'main' })),
    listBranches: vi.fn(async () => ['draft', 'main', 'unconfigured']),
    branchExists: vi.fn(async () => true),
  }
  return {
    repositoryAccess: {
      resolve: vi.fn(async () => ({ api, tokenSource: 'installation' })),
    },
    access: {
      discover: vi.fn(
        async (request: { resources: { type: 'branch'; name: string }[] }) => ({
          visibility: 'filtered',
          resources: request.resources.filter((resource) =>
            allowed.includes(resource.name),
          ),
        }),
      ),
    },
  } as unknown as RequestServices
}

describe('collaborator branches', () => {
  it('lists allowed branches regardless of configuration', async () => {
    const requestServices = services(['main', 'unconfigured'])
    await expect(
      collaboratorBranches(requestServices, user, { owner: 'o', repo: 'r' }),
    ).resolves.toEqual(['main', 'unconfigured'])
  })
  it('opens an allowed requested branch without looking for configuration', async () => {
    const requestServices = services(['unconfigured'])
    await expect(
      collaboratorBranches(
        requestServices,
        user,
        { owner: 'o', repo: 'r' },
        'unconfigured',
        true,
      ),
    ).resolves.toEqual(['unconfigured'])
  })
  it('falls back to an allowed branch when the requested branch is restricted', async () => {
    const requestServices = services(['draft'])
    await expect(
      collaboratorBranches(
        requestServices,
        user,
        { owner: 'o', repo: 'r' },
        'main',
        true,
      ),
    ).resolves.toEqual(['draft'])
  })
})
