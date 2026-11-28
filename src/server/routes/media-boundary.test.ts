import { afterEach, expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import type { RequestServices } from '#/server/context'
import type * as media from '#/server/services/media'

const calls = vi.hoisted(() => ({
  uploadMediaFile: vi.fn(),
  deleteMediaFile: vi.fn(),
  initiateMediaUpload: vi.fn(),
  confirmMediaUpload: vi.fn(),
  abortMediaUpload: vi.fn(),
  createMediaFolder: vi.fn(),
  renameMedia: vi.fn(),
  moveMedia: vi.fn(),
}))
vi.mock('#/server/services/media', async (importOriginal) => ({
  ...(await importOriginal<typeof media>()),
  ...calls,
}))
afterEach(() => vi.resetAllMocks())

const coordinates = {
  owner: 'owner',
  repo: 'site',
  branch: 'main',
  name: 'images',
}
const services = {
  getSession: async () => ({
    user: {
      id: 'user',
      name: 'User',
      email: 'u@example.test',
      emailVerified: true,
    },
  }),
} as unknown as RequestServices
const request = (path: string, input: unknown, origin = 'https://cms.test') =>
  api.request(
    `https://cms.test/api/media/${({ upload: 'files', 'upload/initiate': 'uploads', 'upload/confirm': 'uploads', 'upload/abort': 'uploads', folder: 'folders', delete: 'files', rename: 'files/name', move: 'files/path' } as Record<string, string>)[path]}`,
    {
      method:
        path === 'delete' || path === 'upload/abort'
          ? 'DELETE'
          : ['rename', 'move', 'upload/confirm'].includes(path)
            ? 'PATCH'
            : 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-pagescms-account': 'user',
      },
      body: JSON.stringify(input),
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )

it('routes media writes to the existing operations with validated input', async () => {
  const cases = [
    [
      'upload',
      calls.uploadMediaFile,
      { filename: 'a.png', content: 'YQ==', idempotencyKey: 'id' },
    ],
    [
      'upload/initiate',
      calls.initiateMediaUpload,
      {
        filename: 'a.png',
        size: 1,
        contentType: 'image/png',
        idempotencyKey: 'id',
      },
    ],
    [
      'upload/confirm',
      calls.confirmMediaUpload,
      { path: 'images/a.png', ticket: 'ticket' },
    ],
    [
      'upload/abort',
      calls.abortMediaUpload,
      { path: 'images/a.png', ticket: 'ticket' },
    ],
    ['folder', calls.createMediaFolder, { path: 'images', folder: 'new' }],
    ['delete', calls.deleteMediaFile, { path: 'images/a.png', sha: 'sha' }],
    [
      'rename',
      calls.renameMedia,
      { path: 'images/a.png', sha: 'sha', filename: 'b.png' },
    ],
    [
      'move',
      calls.moveMedia,
      { path: 'images/a.png', sha: 'sha', destination: 'images/new' },
    ],
  ] as const
  for (const [path, operation, data] of cases) {
    operation.mockResolvedValueOnce({ ok: true })
    const response = await request(path, { ...coordinates, ...data })
    expect(response.status).toBe(200)
    expect(operation).toHaveBeenCalledOnce()
    expect(operation).toHaveBeenCalledWith(
      services,
      expect.objectContaining({ id: 'user' }),
      expect.objectContaining(coordinates),
    )
  }
})

it('rejects cross-origin and invalid uploads before invoking an operation', async () => {
  const upload = {
    ...coordinates,
    filename: 'a.png',
    content: 'YQ==',
    idempotencyKey: 'id',
  }
  expect((await request('upload', upload, 'https://other.test')).status).toBe(
    403,
  )
  expect(
    (await request('upload', { ...upload, idempotencyKey: '' })).status,
  ).toBe(400)
  expect(calls.uploadMediaFile).not.toHaveBeenCalled()
})
