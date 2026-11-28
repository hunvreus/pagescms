import { beforeEach, expect, it, vi } from 'vitest'
import {
  abortMediaUpload,
  confirmMediaUpload,
  initiateMediaUpload,
} from '#/server/services/media'
import type { ServiceContext, ServiceUser } from '#/server/services/context'

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  complete: vi.fn(),
  abort: vi.fn(),
}))
vi.mock('#/server/media/media', () => ({
  prepareMediaUpload: mocks.prepare,
  completeMediaUpload: mocks.complete,
  abortMediaUpload: mocks.abort,
}))

const user: ServiceUser = {
  id: 'u',
  name: 'User',
  email: 'u@example.test',
  emailVerified: true,
  githubUsername: null,
}
const coordinates = {
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  name: 'images',
}

function fixture() {
  const authorize = vi.fn(async () => undefined)
  const reserveQuota = vi.fn(async () => ({ id: 'reservation' }))
  const settleQuota = vi.fn(async () => undefined)
  const services = {
    database: {},
    cacheDatabase: {},
    repositoryAccess: {
      resolve: vi.fn(async () => ({ tokenSource: 'user' })),
      executeMutation: vi.fn(
        (_user, _data, _kind, operation: () => Promise<unknown>) => operation(),
      ),
    },
    access: {
      hasPolicy: false,
      authorize,
      reserveQuota,
      settleQuota,
      execute: vi.fn(async (_request, operation: () => Promise<unknown>) =>
        operation(),
      ),
    },
  } as unknown as ServiceContext
  return { services, authorize, reserveQuota, settleQuota }
}
beforeEach(() => vi.resetAllMocks())

it('authorizes and reserves quota before creating a direct-upload plan', async () => {
  const f = fixture()
  const direct = vi.fn(async () => ({ url: 'https://storage.test/upload' }))
  mocks.prepare.mockResolvedValue({ path: 'images/a.png', direct })
  const input = {
    ...coordinates,
    filename: 'a.png',
    size: 4,
    contentType: 'image/png',
    idempotencyKey: 'id',
    rename: undefined,
  }
  const result = await initiateMediaUpload(f.services, user, input)
  expect(result).toMatchObject({ kind: 'direct', path: 'images/a.png' })
  expect(f.authorize).toHaveBeenCalledOnce()
  expect(f.reserveQuota).toHaveBeenCalledOnce()
  expect(direct).toHaveBeenCalledWith('reservation')
  expect(f.settleQuota).not.toHaveBeenCalled()
})

it('releases a reservation when creating the direct-upload plan fails', async () => {
  const f = fixture()
  mocks.prepare.mockResolvedValue({
    path: 'images/a.png',
    direct: async () => {
      throw new Error('storage unavailable')
    },
  })
  await expect(
    initiateMediaUpload(f.services, user, {
      ...coordinates,
      filename: 'a.png',
      size: 4,
      contentType: 'image/png',
      idempotencyKey: 'id',
      rename: undefined,
    }),
  ).rejects.toThrow('storage unavailable')
  expect(f.settleQuota).toHaveBeenCalledWith({ id: 'reservation' }, 'released')
})

it('settles quota only after storage confirms or aborts an upload', async () => {
  const f = fixture()
  const input = { ...coordinates, path: 'images/a.png', ticket: 'ticket' }
  mocks.complete.mockResolvedValue({
    reservationId: 'reservation',
    result: { path: input.path },
  })
  await expect(confirmMediaUpload(f.services, user, input)).resolves.toEqual({
    path: input.path,
  })
  expect(f.settleQuota).toHaveBeenCalledWith({ id: 'reservation' }, 'committed')
  mocks.abort.mockResolvedValue({
    reservationId: 'reservation',
    path: input.path,
  })
  await expect(abortMediaUpload(f.services, user, input)).resolves.toEqual({
    path: input.path,
  })
  expect(f.settleQuota).toHaveBeenCalledWith({ id: 'reservation' }, 'released')
  mocks.complete.mockRejectedValue(new Error('invalid ticket'))
  f.settleQuota.mockClear()
  await expect(confirmMediaUpload(f.services, user, input)).rejects.toThrow(
    'invalid ticket',
  )
  expect(f.settleQuota).not.toHaveBeenCalled()
})
