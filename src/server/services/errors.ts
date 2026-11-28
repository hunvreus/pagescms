import { UserError } from '#/server/http'
import { isContentConflict } from '#/shared/content-conflict'
import { fieldValidationIssues } from '#/shared/field-validation-error'
import { MediaNotFoundError } from '#/shared/media-error'
import { AccessDeniedError } from '#/server/access/policy'
import { InvalidConfigurationError } from '#/server/cache/configuration'
import { RepositoryProviderError } from '#/server/repository/provider'

import type { FieldIssue } from '#/lib/field-values'

export type OperationErrorKind =
  | 'forbidden'
  | 'feature_unavailable'
  | 'quota_exceeded'
  | 'not_found'
  | 'conflict'
  | 'busy'
  | 'invalid'
  | 'configuration_invalid'
  | 'rate_limited'
  | 'unavailable'
  | 'internal'

export interface ClassifiedOperationError {
  kind: OperationErrorKind
  /** Safe to show the caller; internal errors use a generic message. */
  message: string
  retryAfter?: string
  issues?: FieldIssue[]
}

// Plain errors thrown by repository services for caller mistakes. Anything
// unmatched is internal and its message is not exposed.
const notFound = [/ was not found$/, /\bnot found$/, /does not exist/]
const conflict = [
  /already exists/,
  /^The (entry|branch) changed/,
  /^The repository at this address changed/,
]
const forbidden = [
  /\bis disabled\b/,
  /disabled for this/,
  /^Only GitHub users/,
  /^Collaborators cannot change repository configuration$/,
  /^GitHub credentials could not be decrypted\. Reconnect GitHub\.$/,
  /^You can only/,
]
const invalid = [
  /^Unknown content locale$/,
  /^Invalid /,
  /\bmust\b/,
  /\bis invalid$/,
  /\bexceeds\b/,
  /\bnot allowed$/,
  /has not changed$/,
  /already in this folder$/,
  /does not match/,
  /does not use/,
  /is outside/,
  /is required$/,
  /is missing$/,
  /does not allow/,
  /^Expected /,
  /cannot be cancelled/,
  /has finished$/,
  /no longer configured/,
]

function matches(patterns: RegExp[], message: string) {
  return patterns.some((pattern) => pattern.test(message))
}

function networkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true
  if (error instanceof TypeError && /fetch|network/i.test(error.message))
    return true
  return networkFailure(error.cause)
}

/**
 * Maps failures from authorized operations to stable categories for external
 * adapters. `unavailable` means the provider call may or may not have happened.
 */
export function classifyOperationError(
  error: unknown,
): ClassifiedOperationError {
  if (error instanceof AccessDeniedError) {
    if (error.reason === 'feature_unavailable')
      return { kind: 'feature_unavailable', message: error.message }
    if (error.reason === 'quota_exceeded')
      return { kind: 'quota_exceeded', message: error.message }
    return { kind: 'forbidden', message: 'Access denied' }
  }
  if (error instanceof InvalidConfigurationError)
    return {
      kind: 'configuration_invalid',
      message: 'The repository configuration is invalid',
    }
  if (error instanceof MediaNotFoundError)
    return { kind: 'not_found', message: 'Media file not found' }
  if (isContentConflict(error))
    return {
      kind: 'conflict',
      message: 'The file changed since the supplied revision',
    }
  const issues = fieldValidationIssues(error)
  if (issues)
    return { kind: 'invalid', message: 'Content validation failed', issues }
  if (error instanceof RepositoryProviderError) {
    if (
      error.status === 429 ||
      (error.status === 403 &&
        (Boolean(error.retryAfter) || /rate limit/i.test(error.message)))
    )
      return {
        kind: 'rate_limited',
        message: 'The repository provider is rate limiting requests',
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      }
    if (error.status === 404) return { kind: 'not_found', message: 'Not found' }
    if (
      error.status === 409 ||
      (error.status === 422 &&
        /already exists|["']?sha["']? (?:wasn.t|was not) supplied/i.test(
          error.message,
        ))
    )
      return {
        kind: 'conflict',
        message: 'The file changed since the supplied revision',
      }
    if (error.status === 422)
      return {
        kind: 'invalid',
        message: 'The repository provider rejected the input',
      }
    if (error.status === 401 || error.status === 403)
      return { kind: 'forbidden', message: 'Access denied' }
    if (error.status >= 500)
      return {
        kind: 'unavailable',
        message: 'The repository provider is unavailable',
      }
  }
  if (networkFailure(error))
    return {
      kind: 'unavailable',
      message: 'The repository provider did not respond',
    }
  if (error instanceof Error) {
    const message = error.message
    if (message === 'Repository mutation is already running')
      return { kind: 'busy', message }
    if (matches(notFound, message)) return { kind: 'not_found', message }
    if (matches(conflict, message)) return { kind: 'conflict', message }
    if (matches(forbidden, message)) return { kind: 'forbidden', message }
    if (error instanceof UserError || matches(invalid, message))
      return { kind: 'invalid', message }
  }
  return { kind: 'internal', message: 'The operation failed' }
}
