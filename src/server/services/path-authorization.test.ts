import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccessPolicyGateway } from '#/server/access/policy'
import {
  readCollection,
  readRawEntry,
  saveRawEntry,
  saveStructuredEntry,
  createRawEntry,
  deleteEntry,
  moveEntry,
  renameEntry,
  planEntryRename,
  createCollectionFolder,
} from '#/server/services/content'
import {
  mediaAccessRequest,
  readMediaDirectory,
  readMediaDelivery,
  uploadMediaFile,
  deleteMediaFile,
} from '#/server/services/media'
import type { AccessRequest } from '#/server/access/policy'
import type { ServiceContext } from '#/server/services/context'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  move: vi.fn(),
  plan: vi.fn(),
  folder: vi.fn(),
  directory: vi.fn(),
  delivery: vi.fn(),
  upload: vi.fn(),
  deleteMedia: vi.fn(),
}))
vi.mock('#/server/content/entry-editor', () => ({
  loadRawEntry: mocks.read,
  saveRawEntry: mocks.save,
  saveStructuredEntry: mocks.save,
  createRawEntry: mocks.create,
  deleteContentEntry: mocks.remove,
  moveContentEntry: mocks.move,
  renameContentEntry: mocks.move,
  planContentRename: mocks.plan,
  createContentFolder: mocks.folder,
}))
vi.mock('#/server/content/collection', () => ({ loadCollection: mocks.read }))
vi.mock('#/server/media/media', () => ({
  loadMediaDirectory: mocks.directory,
  loadMediaDelivery: mocks.delivery,
  uploadMedia: mocks.upload,
  deleteMedia: mocks.deleteMedia,
}))
const user = {
  id: 'editor',
  emailVerified: true,
  name: 'Editor',
  email: 'editor@example.com',
  githubUsername: null,
}
const coordinates = {
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  name: 'posts',
}
const path = 'posts/team-a/../team-b/post.md'
const canonical = 'posts/team-b/post.md'

function setup(allowed: (request: AccessRequest) => boolean = () => true) {
  const authorize = vi.fn(async (request: AccessRequest) =>
    allowed(request)
      ? { allowed: true as const }
      : { allowed: false as const, reason: 'permission_denied' as const },
  )
  const resolve = vi.fn().mockResolvedValue({ tokenSource: 'user' })
  const services = {
    repositoryAccess: {
      resolve,
      executeMutation: vi.fn(
        (_user, _repository, _kind, operation: () => Promise<unknown>) =>
          operation(),
      ),
    },
    access: createAccessPolicyGateway({ policy: { authorize } }),
    cacheDatabase: {},
  } as unknown as ServiceContext
  return { services, authorize, resolve }
}
beforeEach(() => {
  for (const mock of Object.values(mocks))
    mock.mockReset().mockResolvedValue({ path: canonical, entry: undefined })
})

describe('in-process content authorization', () => {
  const operations = [
    (services: ServiceContext) =>
      readCollection(services, user, { ...coordinates, path }),
    (services: ServiceContext) =>
      readRawEntry(services, user, { ...coordinates, path }),
    (services: ServiceContext) =>
      saveRawEntry(services, user, {
        ...coordinates,
        path,
        source: 'text',
        sha: 'sha',
      }),
    (services: ServiceContext) =>
      saveStructuredEntry(services, user, {
        ...coordinates,
        path,
        content: {},
        sha: 'sha',
      }),
    (services: ServiceContext) =>
      createRawEntry(services, user, {
        ...coordinates,
        parent: path,
        source: 'text',
      }),
    (services: ServiceContext) =>
      deleteEntry(services, user, { ...coordinates, path, sha: 'sha' }),
    (services: ServiceContext) =>
      renameEntry(services, user, {
        ...coordinates,
        path,
        sha: 'sha',
        filename: 'new.md',
      }),
    (services: ServiceContext) =>
      moveEntry(services, user, {
        ...coordinates,
        path,
        sha: 'sha',
        newPath: 'posts/next.md',
      }),
  ]
  it.each(operations)(
    'rejects traversal past a policy prefix before provider access (%#)',
    async (operation) => {
      const { services, authorize } = setup(
        (request) => request.target?.path?.startsWith('posts/team-a/') === true,
      )
      await expect(operation(services)).rejects.toThrow('Access denied')
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ path: canonical }),
        }),
      )
      for (const mock of Object.values(mocks))
        expect(mock).not.toHaveBeenCalled()
    },
  )
  it('passes the same canonical path to the policy and writer', async () => {
    const { services, authorize } = setup()
    await saveRawEntry(services, user, {
      ...coordinates,
      path,
      source: 'text',
      sha: 'sha',
    })
    expect(authorize.mock.calls[0][0].target?.path).toBe(canonical)
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ path: canonical }),
    )
  })
  it('rejects paths escaping the repository before resolving admission', async () => {
    const { services, resolve } = setup()
    await expect(
      readRawEntry(services, user, { ...coordinates, path: '../secret.md' }),
    ).rejects.toThrow('escape')
    expect(resolve).not.toHaveBeenCalled()
  })
  it('checks the resulting folder path before writing', async () => {
    const { services, authorize, resolve } = setup(
      (request) => request.target?.path !== 'posts/blocked/.gitkeep',
    )
    const commit = vi.fn()
    mocks.folder.mockImplementation(async ({ authorizeWrite }) => {
      await authorizeWrite('posts/blocked/.gitkeep')
      commit()
    })
    await expect(
      createCollectionFolder(services, user, {
        ...coordinates,
        parent: 'posts',
        folder: 'blocked',
      }),
    ).rejects.toThrow('Access denied')
    expect(resolve).toHaveBeenCalledOnce()
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(commit).not.toHaveBeenCalled()
  })

  it('checks each path in a rename plan against the access policy', async () => {
    const { services, authorize, resolve } = setup(
      (request) => request.facts?.newPath !== 'posts/forbidden.md',
    )
    mocks.plan.mockResolvedValue([
      { path: 'posts/a.md', newPath: 'posts/b.md', sha: '1' },
      { path: 'posts/a.fr.md', newPath: 'posts/forbidden.md', sha: '2' },
    ])
    await expect(
      planEntryRename(services, user, {
        ...coordinates,
        path: 'posts/a.md',
        sha: '1',
        filename: 'b.md',
      }),
    ).rejects.toThrow('Access denied')
    expect(resolve).toHaveBeenCalledOnce()
    expect(authorize).toHaveBeenCalledTimes(3)
    expect(authorize.mock.calls[2][0]).toMatchObject({
      target: { path: 'posts/a.fr.md' },
      facts: { newPath: 'posts/forbidden.md' },
    })
  })

  it('resolves the principal once while authorizing every translated move', async () => {
    const { services, resolve, authorize } = setup()
    mocks.move.mockImplementation(async ({ authorizeMove }) => {
      await authorizeMove('posts/a.md', 'posts/next/../b.md')
      await authorizeMove('posts/a.fr.md', 'posts/b.fr.md')
    })
    await moveEntry(services, user, {
      ...coordinates,
      path,
      sha: 'sha',
      newPath: 'posts/next/../b.md',
    })
    expect(resolve).toHaveBeenCalledOnce()
    expect(authorize).toHaveBeenCalledTimes(3)
    expect(authorize.mock.calls[1][0].facts?.newPath).toBe('posts/b.md')
  })
})

describe('in-process media authorization', () => {
  it.each([
    (services: ServiceContext) =>
      readMediaDirectory(services, user, { ...coordinates, path }),
    (services: ServiceContext) =>
      deleteMediaFile(services, user, { ...coordinates, path, sha: 'sha' }),
    (services: ServiceContext) =>
      uploadMediaFile(services, user, {
        ...coordinates,
        parent: path,
        filename: 'image.png',
        content: 'eA==',
        idempotencyKey: 'upload',
      }),
  ])(
    'checks canonical media paths, including upload parents (%#)',
    async (operation) => {
      const { services, authorize } = setup(
        (request) => request.target?.path?.startsWith('posts/team-a/') === true,
      )
      await expect(operation(services)).rejects.toThrow('Access denied')
      expect(authorize.mock.calls[0][0].target?.path).toBe(canonical)
      expect(mocks.upload).not.toHaveBeenCalled()
      expect(mocks.deleteMedia).not.toHaveBeenCalled()
      expect(mocks.directory).not.toHaveBeenCalled()
    },
  )
  it('authorizes each delivery path without repeating admission', async () => {
    const { services, resolve } = setup(
      (request) => request.target?.path !== 'private/image.png',
    )
    await expect(
      readMediaDelivery(services, user, {
        ...coordinates,
        paths: ['public/image.png', 'public/../private/image.png'],
      }),
    ).rejects.toThrow('Access denied')
    expect(resolve).toHaveBeenCalledOnce()
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
})

it('omits upload digests only for the built-in unrestricted policy', async () => {
  const { services } = setup()
  const input = { ...coordinates, filename: 'image.png', content: 'eA==' }
  const restricted = await mediaAccessRequest(
    input,
    'media.write',
    services,
    user,
  )
  expect(restricted.facts?.contentDigest).toMatch(/^[a-f0-9]{64}$/)
  services.access = createAccessPolicyGateway({})
  const unrestricted = await mediaAccessRequest(
    input,
    'media.write',
    services,
    user,
  )
  expect(unrestricted.facts?.contentDigest).toBeUndefined()
  expect(unrestricted.facts?.bytes).toBe(1)
})
