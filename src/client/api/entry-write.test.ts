import { afterEach, expect, it, vi } from 'vitest'
import { CONTENT_CONFLICT, isContentConflict } from '#/shared/content-conflict'
import {
  fieldValidationError,
  fieldValidationIssues,
} from '#/shared/field-validation-error'
import { readApi } from '#/client/api/index'

afterEach(() => vi.unstubAllGlobals())

it('restores validation and conflict errors returned by the API', async () => {
  const validation = fieldValidationError([
    { path: 'title', message: 'Required' },
  ])
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: 'operation_error', message: validation.message },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 'content_conflict' }, { status: 409 }),
      ),
  )
  const validationError = await readApi('/api/entries/structured').catch(
    (error: unknown) => error,
  )
  expect(fieldValidationIssues(validationError)).toEqual([
    { path: 'title', message: 'Required' },
  ])
  const conflict = await readApi('/api/entries/raw').catch(
    (error: unknown) => error,
  )
  expect(isContentConflict(conflict)).toBe(true)
  expect((conflict as Error).message).toBe(CONTENT_CONFLICT)
})

it('sends entry writes to the JSON API in the browser', async () => {
  const { updateRawEntry } = await import('#/client/api/entry-write')
  const fetcher = vi.fn(async () => Response.json({ sha: 'new' }))
  vi.stubGlobal('window', {})
  vi.stubGlobal('fetch', fetcher)
  const data = {
    owner: 'owner',
    repo: 'site',
    branch: 'main',
    name: 'posts',
    path: 'posts/a.md',
    source: 'body',
    sha: 'old',
  }
  expect(await updateRawEntry(data)).toEqual({ sha: 'new' })
  expect(fetcher).toHaveBeenCalledWith(
    '/api/entries/raw',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  )
})
