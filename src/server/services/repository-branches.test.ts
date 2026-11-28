import { expect, it, vi } from 'vitest'
import { createAccessPolicyGateway } from '#/server/access/policy'
import {
  listRepositoryBranches,
  readRepository,
} from '#/server/services/repository'
import type { ServiceContext, ServiceUser } from '#/server/services/context'

it('lists and opens allowed collaborator branches without a configuration', async () => {
  const api = {
    getRepository: async () => ({ defaultBranch: 'main' }),
    listBranches: async () => ['main', 'new-branch', 'restricted'],
    branchExists: async () => true,
  }
  const openRepository = vi.fn(async (_user, _owner, _repo, branch) => ({
    repository: { defaultBranch: 'main' },
    branch,
    configuration: null,
  }))
  const services = {
    repositoryAccess: {
      resolve: async () => ({ api, tokenSource: 'installation' }),
    },
    access: createAccessPolicyGateway({
      policy: {
        authorize: async () => ({ allowed: true, grant: {} }),
        discover: async (request) => ({
          visibility: 'filtered',
          resources: request.resources.filter(
            (resource) => resource.name !== 'restricted',
          ),
        }),
      },
    }),
    repositories: { openRepository },
  } as unknown as ServiceContext
  const user = {
    id: 'user',
    email: 'editor@example.com',
    githubUsername: null,
  } as ServiceUser
  const repository = { owner: 'owner', repo: 'repo' }
  await expect(
    listRepositoryBranches(services, user, repository),
  ).resolves.toEqual(['main', 'new-branch'])
  await expect(
    readRepository(services, user, {
      ...repository,
      branch: 'new-branch',
    }),
  ).resolves.toMatchObject({ branch: 'new-branch', configuration: null })
  expect(openRepository).toHaveBeenCalledWith(
    user,
    'owner',
    'repo',
    'new-branch',
    undefined,
  )
})
