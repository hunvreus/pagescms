import { UserError } from '#/server/http'
import type { Database } from '#/server/db/client'
import type { RequestServices } from '#/server/context'
import { executeAtomic } from '#/server/db/core'

// Match Better Auth's default freshness requirement for sensitive operations.
export function isFreshAccountSession(createdAt: Date, now = Date.now()) {
  const age = now - new Date(createdAt).getTime()
  return Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000
}

export async function deleteCurrentAccount(
  services: Pick<
    RequestServices,
    'getSession' | 'database' | 'access' | 'beforeAccountDelete'
  >,
  request: { accountId: string; email: string },
) {
  const session = await services.getSession()
  if (!session?.user) throw new Error('Authentication required')
  if (session.user.id !== request.accountId)
    throw new UserError('Your signed-in account changed. Reload and try again.')
  if (session.user.email.toLowerCase() !== request.email.trim().toLowerCase())
    throw new UserError('Enter your account email to confirm deletion.')
  return services.access.execute(
    {
      operation: 'account.delete',
      principal: { type: 'user', id: session.user.id },
      tenant: { type: 'account', id: session.user.id },
    },
    async () => {
      if (!isFreshAccountSession(session.session.createdAt))
        return { status: 'reauthentication-required' } as const
      await services.beforeAccountDelete?.({ accountId: session.user.id })
      await deleteAccountData(services.database, session.user)
      return { status: 'deleted' } as const
    },
  )
}

export async function deleteAccountData(
  database: Database,
  user: { id: string; email: string },
) {
  const email = user.email.toLowerCase()
  // Revoking membership must commit with deletion, so signing up again cannot
  // silently recover the old account's collaborator access.
  await executeAtomic(database, [
    {
      sql: 'DELETE FROM collaborator_invite WHERE lower(email) = ?',
      args: [email],
    },
    {
      sql: 'DELETE FROM collaborator WHERE user_id = ? OR lower(email) = ?',
      args: [user.id, email],
    },
    {
      sql: 'UPDATE collaborator SET invited_by = NULL WHERE invited_by = ?',
      args: [user.id],
    },
    {
      sql: 'DELETE FROM verification WHERE lower(identifier) IN (?, ?, ?, ?)',
      args: [
        email,
        `sign-in-otp-${email}`,
        `email-verification-otp-${email}`,
        `forget-password-otp-${email}`,
      ],
    },
    { sql: 'DELETE FROM session WHERE user_id = ?', args: [user.id] },
    { sql: 'DELETE FROM account WHERE user_id = ?', args: [user.id] },
    { sql: 'DELETE FROM user WHERE id = ?', args: [user.id] },
  ])
}
