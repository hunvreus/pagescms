import { afterEach, expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import { saveRawEntry } from '#/server/services/content'
import { UserError } from '#/server/http'
import { GitHubApiError } from '#/server/github/api'
import { CONTENT_CONFLICT } from '#/shared/content-conflict'
import { fieldValidationError } from '#/shared/field-validation-error'
import type { RequestServices } from '#/server/context'
import type * as content from '#/server/services/content'

vi.mock('#/server/services/content', async (importOriginal) => ({
  ...(await importOriginal<typeof content>()),
  saveRawEntry: vi.fn(),
}))

afterEach(() => vi.resetAllMocks())

const input = {
  owner: 'owner',
  repo: 'site',
  branch: 'main',
  name: 'posts',
  path: 'posts/a.md',
  source: 'body',
  sha: 'sha',
}
const session = {
  user: {
    id: 'user',
    name: 'User',
    email: 'user@example.test',
    emailVerified: true,
  },
}
const services = {
  getSession: async () => session,
} as unknown as RequestServices
function request(data: unknown = input, origin = 'https://cms.test') {
  return api.request(
    'https://cms.test/api/entries/raw',
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin,
        'x-pagescms-account': 'user',
      },
      body: JSON.stringify(data),
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
}

it('checks origin and input before performing an entry write', async () => {
  expect((await request(input, 'https://other.test')).status).toBe(403)
  expect((await request({ ...input, sha: 1 })).status).toBe(400)
  expect(saveRawEntry).not.toHaveBeenCalled()
})

it('preserves validation, conflict and content errors without exposing arbitrary failures', async () => {
  vi.mocked(saveRawEntry).mockRejectedValueOnce(
    fieldValidationError([{ path: 'title', message: 'Required' }]),
  )
  const validation = await request()
  expect(validation.status).toBe(400)
  expect(await validation.json()).toMatchObject({
    code: 'operation_error',
    message: expect.stringContaining('Required'),
  })
  vi.mocked(saveRawEntry).mockRejectedValueOnce(new Error(CONTENT_CONFLICT))
  const conflict = await request()
  expect(conflict.status).toBe(409)
  expect(await conflict.json()).toEqual({ code: 'content_conflict' })
  vi.mocked(saveRawEntry).mockRejectedValueOnce(
    new GitHubApiError('File changed since this edit was opened', 409),
  )
  const providerConflict = await request()
  expect(providerConflict.status).toBe(409)
  expect(await providerConflict.json()).toEqual({
    code: 'operation_error',
    message: 'File changed since this edit was opened',
  })
  vi.mocked(saveRawEntry).mockRejectedValueOnce(
    new UserError('Creating this content is disabled'),
  )
  const denied = await request()
  expect(denied.status).toBe(403)
  expect(await denied.json()).toEqual({
    code: 'operation_error',
    message: 'Creating this content is disabled',
  })
  vi.mocked(saveRawEntry).mockRejectedValueOnce(new Error('internal secret'))
  const failure = await request()
  expect(failure.status).toBe(500)
  expect(await failure.json()).toEqual({ code: 'internal_error' })
})

it.each([
  [new GitHubApiError('already exists', 422), 409],
  [new GitHubApiError('Validation failed', 422), 400],
  [new GitHubApiError('Rate limit', 403, '60'), 429],
  [new GitHubApiError('Service unavailable', 503), 503],
] as const)(
  'classifies provider responses for an editor save',
  async (error, status) => {
    vi.mocked(saveRawEntry).mockRejectedValueOnce(error)
    const response = await request()
    expect(response.status).toBe(status)
    if (status === 429) expect(response.headers.get('retry-after')).toBe('60')
  },
)

it('rejects an account switch before writing', async () => {
  const response = await api.request(
    'https://cms.test/api/entries/raw',
    {
      method: 'PATCH',
      headers: {
        origin: 'https://cms.test',
        'content-type': 'application/json',
        'x-pagescms-account': 'previous-user',
      },
      body: JSON.stringify(input),
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ code: 'account_changed' })
  expect(saveRawEntry).not.toHaveBeenCalled()
})

it('rejects a write without an account identity', async () => {
  const response = await api.request(
    'https://cms.test/api/entries/raw',
    {
      method: 'PATCH',
      headers: {
        origin: 'https://cms.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )
  expect(response.status).toBe(409)
  expect(saveRawEntry).not.toHaveBeenCalled()
})
