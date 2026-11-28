import { afterEach, expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import type { RequestServices } from '#/server/context'

const operations = vi.hoisted(() => ({
  readCollaborators: vi.fn(),
  addCollaborators: vi.fn(),
  deleteCollaborator: vi.fn(),
}))
vi.mock('#/server/services/collaborators', () => operations)
afterEach(() => vi.resetAllMocks())
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
const repository = { owner: 'owner', repo: 'site', branch: 'main' }
const request = (path: string, data: unknown, origin = 'https://cms.test') => {
  const read = ['list'].includes(path)
  const url = new URL(
    `https://cms.test/api/collaborators${['list', 'invite', 'remove'].includes(path) ? '' : `/${path}`}`,
  )
  if (read)
    for (const [key, value] of Object.entries(data as Record<string, unknown>))
      url.searchParams.set(key, String(value))
  return api.request(
    url.toString(),
    read
      ? { method: 'GET' }
      : {
          method: path === 'remove' ? 'DELETE' : 'POST',
          headers: {
            origin,
            'content-type': 'application/json',
            'x-pagescms-account': 'user',
          },
          body: JSON.stringify(data),
        },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
}

it('returns collaborator errors with their message and status', async () => {
  const { CollaboratorRequestError } =
    await import('#/server/collaborators/collaborators')
  operations.addCollaborators.mockRejectedValueOnce(
    new CollaboratorRequestError('Invitations are unavailable', 503),
  )
  const response = await request('invite', {
    ...repository,
    emails: 'a@example.test',
  })
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    code: 'operation_error',
    message: 'Invitations are unavailable',
  })
})
