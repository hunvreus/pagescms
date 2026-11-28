import { expect, it, vi } from 'vitest'
import { loadRepositoryActions } from '../actions/actions'
import { collaboratorBranches } from '../collaborators/branches'
import { loadReferenceOptions } from '../content/reference'
import {
  inviteCollaborators,
  listCollaborators,
  removeCollaborator,
} from '../collaborators/collaborators'
import type { Database } from '#/server/db/client'
import type { RepositoryAccessService } from '#/server/access/repository'
import type { RequestServices } from '#/server/context'

it('retains a supplied repository ID in action, reference, and branch resolution', async () => {
  const resolve = vi
    .fn()
    .mockRejectedValue(new Error('Repository identity changed'))
  const repositoryAccess = { resolve } as unknown as RepositoryAccessService
  const database = {} as Database
  const user = {
    id: 'u',
    name: 'User',
    email: 'u@example.test',
    githubUsername: null,
  }
  const coordinates = { owner: 'o', repo: 'r', branch: 'main', repoId: '42' }
  for (const run of [
    () =>
      loadRepositoryActions({
        database,
        cacheDatabase: database,
        repositoryAccess,
        user,
        ...coordinates,
      }),
    () =>
      loadReferenceOptions({
        database,
        repositoryAccess,
        user,
        ...coordinates,
        collection: 'posts',
        query: '',
        valueTemplate: '',
        labelTemplate: '',
        searchFields: [],
        selectedValues: [],
      }),
    () =>
      collaboratorBranches(
        { repositoryAccess } as RequestServices,
        user,
        coordinates,
      ),
  ])
    await expect(run()).rejects.toThrow('Repository identity changed')
  expect(resolve).toHaveBeenCalledTimes(3)
  for (const call of resolve.mock.calls) expect(call[4]).toBe('42')
})

it('retains a supplied repository ID when managing collaborators', async () => {
  const resolve = vi
    .fn()
    .mockRejectedValue(new Error('Repository identity changed'))
  const repositoryAccess = { resolve } as unknown as RepositoryAccessService
  const database = {} as Database
  const user = {
    id: 'u',
    name: 'User',
    email: 'u@example.test',
    githubUsername: 'user',
  }
  const common = {
    database,
    repositoryAccess,
    user,
    owner: 'o',
    repo: 'r',
    repoId: '42',
  }
  for (const run of [
    () =>
      listCollaborators(
        database,
        user,
        'o',
        'r',
        repositoryAccess,
        undefined,
        '42',
      ),
    () =>
      inviteCollaborators({
        ...common,
        baseUrl: 'https://example.test',
        emails: ['other@example.test'],
      }),
    () => removeCollaborator({ ...common, id: 1 }),
  ])
    await expect(run()).rejects.toThrow('Repository identity changed')
  expect(resolve).toHaveBeenCalledTimes(3)
  for (const call of resolve.mock.calls) expect(call[4]).toBe('42')
})
