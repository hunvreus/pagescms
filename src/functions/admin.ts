import { createServerFn } from '@tanstack/react-start'

import type { RequestServices } from '#/server/request-services.server'

export function parseAdminSearch(input: unknown) {
  const value =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {}
  const query = typeof value.query === 'string' ? value.query.trim() : ''
  const page = typeof value.page === 'number' ? value.page : 1
  if (query.length > 100) throw new Error('Admin search is too long')
  if (!Number.isInteger(page) || page < 1) throw new Error('Invalid admin page')
  return { query, page }
}

function parseAdminAction(input: unknown) {
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
  return {
    action: value.action,
    userId: typeof value.userId === 'string' ? value.userId : null,
  }
}

async function requireAdmin(services: RequestServices) {
  const session = await services.getSession()
  if (!session?.user) throw new Error('Authentication required')
  if (
    !services.configuration.adminEmails.includes(
      session.user.email.toLowerCase(),
    )
  ) {
    throw new Error('Admin access required')
  }
  await services.access.authorize({
    operation: 'admin.access',
    principal: { type: 'user', id: session.user.id },
    tenant: { type: 'deployment', id: services.configuration.auth.baseUrl },
  })
  return session.user
}

export const getAdminDashboard = createServerFn({ method: 'GET' })
  .validator(parseAdminSearch)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    await requireAdmin(services)
    const { loadAdminDashboard } = await import('#/server/admin-service.server')
    return loadAdminDashboard(services.database, data)
  })

export const runAdminAction = createServerFn({ method: 'POST' })
  .validator(parseAdminAction)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = await requireAdmin(services)
    const { resetGlobalCache, revokeAllSessions, revokeUserSessions } =
      await import('#/server/admin-service.server')
    if (data.action === 'reset-cache') {
      await resetGlobalCache(services.database)
      return { message: 'Global cache reset', signedOut: false }
    }
    if (data.action === 'revoke-all') {
      await revokeAllSessions(services.database)
      return { message: 'All sessions revoked', signedOut: true }
    }
    if (!data.userId) throw new Error('Admin user id is required')
    await revokeUserSessions(services.database, data.userId)
    return {
      message: 'User sessions revoked',
      signedOut: data.userId === user.id,
    }
  })
