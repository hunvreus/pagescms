import { all, first } from '#/server/db/sql'
import safeRegex from 'safe-regex2'
import { APIError } from 'better-auth/api'
import { isEmailAllowed } from '#/shared/sign-in-allowlist'
import type { Database } from '#/server/db/client'
import type { AllowlistRule } from '#/shared/sign-in-allowlist'

export async function emailCanSignIn(database: Database, email: string) {
  const rules = await all<AllowlistRule>(
    database,
    'SELECT type, value FROM sign_in_allowlist',
    [],
  )
  return isEmailAllowed(email, rules, safeRegex)
}

export async function assertEmailCanSignIn(database: Database, email: string) {
  if (!(await emailCanSignIn(database, email)))
    throw new APIError('FORBIDDEN', {
      message: 'This email address is not allowed to sign in.',
    })
}

export async function assertUserCanSignIn(database: Database, userId: string) {
  const user = await first<{ email: string }>(
    database,
    'SELECT email FROM user WHERE id = ?',
    [userId],
  )
  if (!user)
    throw new APIError('FORBIDDEN', { message: 'This account cannot sign in.' })
  await assertEmailCanSignIn(database, user.email)
}
