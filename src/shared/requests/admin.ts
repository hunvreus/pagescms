import safeRegex from 'safe-regex2'
import {
  allowlistRuleSchema,
  parseAllowlistEmails,
} from '#/shared/sign-in-allowlist'

export function parseAllowlistSearch(input: unknown) {
  const value =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {}
  const query = typeof value.query === 'string' ? value.query.trim() : ''
  const page = value.page === undefined ? 1 : Number(value.page)
  if (
    query.length > 100 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1_000_000
  )
    throw new Error('Invalid allowlist search')
  return { query, page }
}

export function parseAllowlistAction(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid allowlist action')
  const value = input as Record<string, unknown>
  if (value.action === 'add') {
    const rule = allowlistRuleSchema.parse(value)
    if (rule.type === 'pattern' && !safeRegex(rule.value))
      throw new Error('Invalid allowlist pattern')
    return { action: 'add' as const, rule }
  }
  if (value.action === 'import' && typeof value.emails === 'string')
    return {
      action: 'import' as const,
      emails: parseAllowlistEmails(value.emails),
    }
  if (
    value.action === 'remove' &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 100
  )
    return { action: 'remove' as const, id: value.id }
  throw new Error('Invalid allowlist action')
}

export function parseAdminSearch(input: unknown) {
  const value =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {}
  const query = typeof value.query === 'string' ? value.query.trim() : ''
  const page = typeof value.page === 'number' ? value.page : 1
  const repoQuery =
    typeof value.repoQuery === 'string' ? value.repoQuery.trim() : ''
  const repoPage = typeof value.repoPage === 'number' ? value.repoPage : 1
  if (query.length > 100) throw new Error('Admin search is too long')
  if (!Number.isInteger(page) || page < 1) throw new Error('Invalid admin page')
  if (repoQuery.length > 100) throw new Error('Admin search is too long')
  if (!Number.isInteger(repoPage) || repoPage < 1)
    throw new Error('Invalid repository page')
  return { query, page, repoQuery, repoPage }
}

export function parseAdminAction(input: unknown): {
  action: 'revoke-user' | 'revoke-all' | 'reset-cache'
  userId: string | null
  target: 'all' | 'content' | 'configuration'
} {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid admin action')
  const value = input as Record<string, unknown>
  if (
    value.action !== 'revoke-user' &&
    value.action !== 'revoke-all' &&
    value.action !== 'reset-cache'
  ) {
    throw new Error('Invalid admin action')
  }
  if (
    value.action === 'revoke-user' &&
    (typeof value.userId !== 'string' || !value.userId)
  ) {
    throw new Error('Admin user id is required')
  }
  const target = value.target ?? 'all'
  if (target !== 'content' && target !== 'configuration' && target !== 'all')
    throw new Error('Invalid cache target')
  return {
    action: value.action,
    userId: typeof value.userId === 'string' ? value.userId : null,
    target,
  }
}
