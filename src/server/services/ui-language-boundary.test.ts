import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticationState } from '#/server/services/authentication-state'
import { saveAccountLanguage } from '#/server/services/account-language'
import type { RequestServices } from '#/server/context'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  cookie: vi.fn(),
  header: vi.fn(),
  log: vi.fn(),
}))
vi.mock('#/server/http', () => ({
  isClientDisconnect: (error: Error) => error.name === 'AbortError',
  logServerEvent: mocks.log,
  serverErrorDetails: () => ({ error: 'unavailable' }),
}))
vi.mock('#/server/account/preferences', () => ({
  readAccountPreferences: mocks.read,
  updateAccountLanguage: mocks.update,
}))
const get = async ({
  context,
  defaultLanguage = 'en',
}: {
  context: { getServices: () => unknown }
  defaultLanguage?: string
}) => {
  const services = context.getServices() as RequestServices
  const result = await authenticationState(
    {
      ...services,
      configuration: {
        adminEmails: [],
        defaultLanguage,
        auth: { secret: 'test-only-auth-secret-at-least-32-characters' },
      },
      authenticationMethods: { email: false },
    } as unknown as RequestServices,
    mocks.cookie(),
    mocks.header(),
  )
  return { locale: result.locale }
}
const save = (input: {
  context: { getServices: () => unknown }
  data: { accountId: string; language: string }
}) =>
  saveAccountLanguage(
    input.context.getServices() as RequestServices,
    input.data as Parameters<typeof saveAccountLanguage>[1],
  )
beforeEach(() => {
  vi.resetAllMocks()
})
describe('language preference boundaries', () => {
  it('uses preferences already returned with the session without another database read', async () => {
    mocks.cookie.mockReturnValue('en')
    mocks.header.mockReturnValue('en')
    expect(
      await get({
        context: {
          getServices: () => ({
            getSession: async () => ({
              user: { id: 'alice', preferences: { language: 'fr' } },
            }),
          }),
        },
      }),
    ).toEqual({ locale: 'fr' })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('reads only the signed-in profile and gives it precedence over anonymous preferences', async () => {
    mocks.read.mockResolvedValue({ language: 'fr' })
    mocks.cookie.mockReturnValue('en')
    mocks.header.mockReturnValue('en')
    const database = {}
    expect(
      await get({
        context: {
          getServices: () => ({
            database,
            getSession: async () => ({ user: { id: 'alice' } }),
          }),
        },
      }),
    ).toEqual({ locale: 'fr' })
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(database, 'alice')
  })
  it('does not read a profile for anonymous requests', async () => {
    mocks.header.mockReturnValue('fr-FR')
    expect(
      await get({
        context: { getServices: () => ({ getSession: async () => null }) },
      }),
    ).toEqual({ locale: 'fr' })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('uses the configured default when no supported preference exists', async () => {
    expect(
      await get({
        context: { getServices: () => ({ getSession: async () => null }) },
        defaultLanguage: 'es',
      }),
    ).toEqual({ locale: 'es' })
    mocks.header.mockReturnValue('fr-FR')
    expect(
      await get({
        context: { getServices: () => ({ getSession: async () => null }) },
        defaultLanguage: 'es',
      }),
    ).toEqual({ locale: 'fr' })
  })
  it('rejects late writes belonging to another account before policy or persistence', async () => {
    const execute = vi.fn()
    const context = {
      getServices: () => ({
        getSession: async () => ({ user: { id: 'bob' } }),
        access: { execute },
      }),
    }
    await expect(
      save({ context, data: { accountId: 'alice', language: 'fr' } }),
    ).rejects.toThrow('signed-in account changed')
    expect(execute).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('enforces account.update policy before saving', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('denied'))
    const context = {
      getServices: () => ({
        getSession: async () => ({ user: { id: 'alice' } }),
        access: { execute },
      }),
    }
    await expect(
      save({ context, data: { accountId: 'alice', language: 'fr' } }),
    ).rejects.toThrow('denied')
    expect(execute.mock.calls[0][0]).toEqual({
      operation: 'account.update',
      principal: { type: 'user', id: 'alice' },
      tenant: { type: 'account', id: 'alice' },
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

it('falls back to Accept-Language when profile preferences cannot be read', async () => {
  mocks.read.mockRejectedValue(new Error('database unavailable'))
  mocks.header.mockReturnValue('fr-FR')
  expect(
    await get({
      context: {
        getServices: () => ({
          getSession: async () => ({ user: { id: 'alice' } }),
        }),
      },
    }),
  ).toEqual({ locale: 'fr' })
})
