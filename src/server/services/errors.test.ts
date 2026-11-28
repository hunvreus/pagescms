import { UserError } from '#/server/http'
import { describe, expect, it } from 'vitest'
import { CONTENT_CONFLICT } from '#/shared/content-conflict'
import { fieldValidationError } from '#/shared/field-validation-error'
import { AccessDeniedError } from '#/server/access/policy'
import { RepositoryProviderError } from '#/server/repository/provider'
import { classifyOperationError } from '#/server/services/errors'

describe('classifyOperationError', () => {
  it.each([
    [
      new AccessDeniedError({ allowed: false, reason: 'permission_denied' }),
      'forbidden',
    ],
    [
      new AccessDeniedError({ allowed: false, reason: 'feature_unavailable' }),
      'feature_unavailable',
    ],
    [new Error(CONTENT_CONFLICT), 'conflict'],
    [new RepositoryProviderError('Not Found', 404), 'not_found'],
    [new RepositoryProviderError('already exists', 422), 'conflict'],
    [new RepositoryProviderError('Validation Failed', 422), 'invalid'],
    [new RepositoryProviderError('sha mismatch', 409), 'conflict'],
    [new RepositoryProviderError('rate limit', 403, '30'), 'rate_limited'],
    [new RepositoryProviderError('bad gateway', 502), 'unavailable'],
    [new TypeError('fetch failed'), 'unavailable'],
    [
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
      'unavailable',
    ],
    [new Error('Content schema posts was not found'), 'not_found'],
    [new Error('An entry already exists at a.md'), 'conflict'],
    [new Error('Deleting this content is disabled'), 'forbidden'],
    [new Error('Entry exceeds the 5 MB limit'), 'invalid'],
    [new Error('Unknown content locale'), 'invalid'],
    [new UserError('Choose another filename'), 'invalid'],
    [new UserError('An entry already exists at a.md'), 'conflict'],
    [new Error('Repository mutation is already running'), 'busy'],
    [new Error('SQLITE_BUSY: database is locked'), 'internal'],
  ])('maps %s', (error, kind) => {
    expect(classifyOperationError(error).kind).toBe(kind)
  })

  it('keeps validation issues and hides internal messages', () => {
    const issues = [{ path: 'title', message: 'Required' }]
    expect(classifyOperationError(fieldValidationError(issues))).toMatchObject({
      kind: 'invalid',
      issues,
    })
    expect(classifyOperationError(new Error('secret detail')).message).toBe(
      'The operation failed',
    )
  })
})
