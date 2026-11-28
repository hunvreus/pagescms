import { expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import { AccessDeniedError } from '#/server/access/policy'
import type { RequestServices } from '#/server/context'

vi.mock('./entry-editor', () => ({
  loadEntryTranslations: async ({
    authorizeRead,
  }: {
    authorizeRead: (path: string) => Promise<void>
  }) => {
    await authorizeRead('posts/fr.md')
    return [{ path: 'posts/fr.md', exists: true }]
  },
}))

it('checks permission for each translated path before returning it', async () => {
  const authorize = vi.fn(async (request: { target?: { path?: string } }) => {
    if (request.target?.path === 'posts/fr.md')
      throw new AccessDeniedError({
        allowed: false,
        reason: 'permission_denied',
      })
  })
  const execute = vi.fn(
    async (_request: unknown, operation: () => Promise<unknown>) => operation(),
  )
  const services = {
    getSession: async () => ({
      user: { id: 'user', email: 'user@example.test', emailVerified: true },
    }),
    repositoryAccess: { resolve: async () => ({ tokenSource: 'user' }) },
    access: { execute, authorize },
  } as unknown as RequestServices
  const response = await api.request(
    '/api/entries/translations?owner=owner&repo=site&branch=main&name=posts&path=posts%2Fen.md',
    {},
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(403)
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({
      target: expect.objectContaining({ path: 'posts/en.md' }),
    }),
    expect.any(Function),
  )
  expect(authorize).toHaveBeenCalledWith(
    expect.objectContaining({
      target: expect.objectContaining({ path: 'posts/fr.md' }),
    }),
  )
})
