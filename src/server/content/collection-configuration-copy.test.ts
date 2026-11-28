import { afterEach, expect, it, vi } from 'vitest'
import * as registry from '#/fields/registry'
import * as json from '#/shared/json'
import { loadCollection } from './collection'
import { localizedDirectory } from './localized-directory'
import { readCollection } from '#/server/services/content'
import type { ServiceContext } from '#/server/services/context'
import type { AccessRequest } from '#/server/access/policy'
import type { Database } from '#/server/db/client'
import type { RepositoryAccessService } from '#/server/access/repository'

const fixture = vi.hoisted(() => ({
  object: {
    counter: 0,
    content: [
      {
        name: 'posts',
        type: 'collection',
        path: 'posts',
        format: 'json',
        fields: [{ name: 'title', type: 'string' }],
      },
    ],
  },
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({
    get: async () => ({ object: fixture.object, repositoryId: 1 }),
  }),
}))
vi.mock('./localized-directory', () => ({
  localizedDirectory: vi.fn(async () => ({
    entries: ['a', 'b'].map((name) => ({
      type: 'file',
      name: `${name}.json`,
      path: `posts/${name}.json`,
      content: JSON.stringify({ title: name }),
      sha: name,
    })),
  })),
}))
afterEach(() => vi.restoreAllMocks())
const input = {
  database: {} as Database,
  repositoryAccess: {
    resolve: async () => ({ api: {}, tokenSource: 'user' }),
  } as unknown as RepositoryAccessService,
  user: { id: 'u', email: 'u@example.test', githubUsername: null },
  owner: 'o',
  repo: 'r',
  branch: 'main',
  name: 'posts',
}

it('passes a requested refresh through to the directory cache', async () => {
  await loadCollection({ ...input, forceRefresh: true })
  expect(localizedDirectory).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ forceRefresh: true }),
    expect.anything(),
    undefined,
  )
})

it('does not copy the configuration per entry without custom transforms', async () => {
  const copy = vi.spyOn(json, 'toJsonValue')
  const result = await loadCollection(input)
  expect(copy).not.toHaveBeenCalled()
  expect(result.collection.fields).toBe(fixture.object.content[0].fields)
  expect(
    copy.mock.calls.filter(([value]) => value === fixture.object),
  ).toHaveLength(0)
})

it('shares a frozen configuration with custom transforms', async () => {
  const read = vi.fn((value, _field, configuration) => {
    const object = configuration as { counter: number }
    expect(configuration).toBe(fixture.object)
    expect(Object.isFrozen(configuration)).toBe(true)
    expect(Object.isFrozen(fixture.object.content)).toBe(true)
    expect(() => object.counter++).toThrow(TypeError)
    return value
  })
  vi.spyOn(registry, 'customFieldDefinition').mockReturnValue({ read })
  const copy = vi.spyOn(json, 'toJsonValue')
  const result = await loadCollection(input)
  expect(read).toHaveBeenCalledTimes(2)
  expect(
    copy.mock.calls.filter(([value]) => value === fixture.object),
  ).toHaveLength(0)
  expect(
    result.contents.map((entry) =>
      entry.type === 'file' ? entry.fields : undefined,
    ),
  ).toEqual([{ title: 'a' }, { title: 'b' }])
  expect(fixture.object.counter).toBe(0)
})

it('keeps an unparseable entry and identifies its path', async () => {
  vi.spyOn(registry, 'customFieldDefinition').mockReturnValue({
    read: (value) => {
      if (value === 'a') throw new Error('Invalid value')
      return value
    },
  })
  const result = await loadCollection(input)
  expect(result.parseErrorPaths).toEqual(['posts/a.json'])
  expect(result.contents.map((entry) => entry.path)).toEqual([
    'posts/a.json',
    'posts/b.json',
  ])
  expect(result.errors[0]).toContain('Invalid value')
})

it('keeps the repository ID through collection authorization and loading', async () => {
  let currentId = '42'
  const resolve = vi.fn(async (_user, _owner, _repo, _branch, repoId) => {
    if (repoId !== currentId) throw new Error('Repository identity changed')
    return { api: {}, tokenSource: 'user' as const }
  })
  const services = {
    cacheDatabase: input.database,
    repositoryAccess: { resolve },
    access: {
      execute: async (
        request: AccessRequest,
        operation: () => Promise<unknown>,
      ) => {
        expect(request.target?.repository?.repoId).toBe('42')
        // A transfer/reuse discovered after authorization must not redirect
        // the collection read to a different repository.
        currentId = '43'
        return operation()
      },
    },
  } as unknown as ServiceContext
  await expect(
    readCollection(
      services,
      { ...input.user, name: 'User', emailVerified: true },
      {
        owner: 'o',
        repo: 'r',
        branch: 'main',
        name: 'posts',
        repoId: '42',
      },
    ),
  ).rejects.toThrow('Repository identity changed')
  expect(resolve).toHaveBeenCalledTimes(2)
  expect(resolve).toHaveBeenLastCalledWith(
    { ...input.user, name: 'User', emailVerified: true },
    'o',
    'r',
    'main',
    '42',
  )
})
