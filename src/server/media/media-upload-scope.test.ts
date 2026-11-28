import { invalidateDirectoryCacheAfterMutation } from '#/server/cache/directory'
import { RepositoryProviderError } from '#/server/repository/provider'
import { createGitHubApi } from '#/server/github/api'
import type * as MediaProviderModule from './provider'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  abortMediaUpload,
  completeMediaUpload,
  moveMediaFile,
  renameMediaFile,
} from './media'
import { mediaMoveAuthorizer } from '#/server/services/media'
import type { AccessRequest } from '#/server/access/policy'
import type { Database } from '#/server/db/client'

const state = vi.hoisted(() => ({
  effects: [] as string[],
  complete: vi.fn(),
  abort: vi.fn(),
  move: vi.fn(),
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({
    get: async () => ({
      object: {
        media: [{ name: 'images', input: 'images', output: '/images' }],
      },
    }),
  }),
}))
vi.mock('#/server/cache/directory', () => ({
  createDirectoryCache: () => ({}),
  invalidateDirectoryCacheAfterMutation: vi.fn(),
}))
vi.mock('#/server/cache/repository', () => ({
  updateRepositoryCacheAfterMutation: vi.fn(),
}))
vi.mock('./provider', async (original) => ({
  ...(await original<typeof MediaProviderModule>()),
  resolveMediaProvider: async () => ({
    storage: {
      move: state.move,
      directUpload: { complete: state.complete, abort: state.abort },
    },
  }),
}))
const input = {
  database: {} as Database,
  repositoryAccess: {
    resolve: vi.fn(async () => ({
      api: createGitHubApi('test-token', vi.fn<typeof fetch>()),
      tokenSource: 'user' as const,
    })),
  },
  user: { id: 'editor', email: 'editor@example.com', githubUsername: null },
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  name: 'images',
  path: 'images/allowed/upload.png',
  ticket: 'ticket-for-images/private/upload.png',
}
beforeEach(() => {
  state.effects.length = 0
  const verify = ({ path }: { path?: string }) => {
    const ticketPath = 'images/private/upload.png'
    if (path !== undefined && path !== ticketPath)
      throw new Error('Upload ticket path does not match its request')
    state.effects.push(ticketPath)
    return ticketPath
  }
  state.complete.mockReset().mockImplementation(async (request) => ({
    result: { path: verify(request), version: 'v' },
    reservationId: 'r',
  }))
  state.abort.mockReset().mockImplementation(async (request) => ({
    path: verify(request),
    reservationId: 'r',
  }))
})
describe('direct upload authorization path binding', () => {
  it.each([
    ['complete', completeMediaUpload],
    ['abort', abortMediaUpload],
  ] as const)(
    'binds the authorized path before %s has provider side effects',
    async (_label, operation) => {
      await expect(operation(input)).rejects.toThrow(/path does not match/)
      expect(state.effects).toEqual([])
    },
  )
})

describe('media move authorization', () => {
  const request: AccessRequest = {
    operation: 'media.rename',
    principal: { type: 'user', id: 'editor' },
    tenant: { type: 'account', id: 'editor' },
    target: { media: 'images', path: 'images/allowed/upload.png' },
  }
  it.each(['move', 'rename'] as const)(
    'checks both canonical paths before storage %s, for allowed and denied destinations',
    async (operation) => {
      const destination =
        operation === 'move'
          ? 'images/private/upload.png'
          : 'images/allowed/private.png'
      const authorize = vi.fn(async (value: AccessRequest) => {
        if (value.target?.path === destination)
          throw new Error('Destination denied')
        return undefined
      })
      state.move.mockReset().mockResolvedValue({
        path: destination,
        version: 'v2',
        revision: 'head2',
      })
      const scoped = {
        ...input,
        user: { ...input.user, name: 'Editor' },
        sha: 'v1',
        authorizeMove: mediaMoveAuthorizer({ authorize }, request),
      }
      const run = () =>
        operation === 'move'
          ? moveMediaFile({
              ...scoped,
              destination: 'images/allowed/../private',
            })
          : renameMediaFile({ ...scoped, filename: 'private.png' })
      await expect(run()).rejects.toThrow('Destination denied')
      expect(state.move).not.toHaveBeenCalled()
      expect(authorize.mock.calls.map(([value]) => value.target?.path)).toEqual(
        ['images/allowed/upload.png', destination],
      )
      expect(authorize.mock.calls[0][0].facts?.newPath).toBe(destination)
      authorize.mockClear().mockResolvedValue(undefined)
      await expect(run()).resolves.toMatchObject({ path: destination })
      expect(authorize.mock.calls.map(([value]) => value.target?.path)).toEqual(
        ['images/allowed/upload.png', destination],
      )
      expect(state.move).toHaveBeenCalledWith(
        expect.objectContaining({
          path: input.path,
          destination,
          version: 'v1',
        }),
      )
    },
  )
})

it.each([404, 409])(
  'invalidates both folders before returning a storage move error (%s)',
  async (status) => {
    const error = new RepositoryProviderError('Move failed', status)
    state.move.mockReset().mockRejectedValue(error)
    vi.mocked(invalidateDirectoryCacheAfterMutation).mockClear()
    await expect(
      moveMediaFile({
        ...input,
        user: { ...input.user, name: 'Editor' },
        sha: 'v1',
        destination: 'images/elsewhere',
        authorizeMove: async () => {},
      }),
    ).rejects.toBe(error)
    expect(invalidateDirectoryCacheAfterMutation).toHaveBeenCalledWith(
      input.database,
      input.owner,
      input.repo,
      input.branch,
      [input.path, 'images/elsewhere/upload.png'],
      undefined,
      'github.com',
      undefined,
    )
  },
)
