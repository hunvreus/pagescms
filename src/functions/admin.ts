import { createServerFn } from '@tanstack/react-start'
import { isDeploymentAdmin } from '#/server/admin-access.server'

import type { RequestServices } from '#/server/request-services.server'

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

async function requireAdmin(services: RequestServices) {
  const session = await services.getSession()
  if (!session?.user) throw new Error('Authentication required')
  if (!isDeploymentAdmin(session.user, services.configuration.adminEmails)) {
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
    const user = await requireAdmin(services)
    const { loadAdminDashboard } = await import('#/server/admin-service.server')
    const dashboard = await loadAdminDashboard(
      services.database,
      services.cacheDatabase,
      data,
    )
    return {
      ...dashboard,
      user: {
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        githubUsername: user.githubUsername ?? null,
      },
    }
  })

export const runAdminAction = createServerFn({ method: 'POST' })
  .validator(parseAdminAction)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = await requireAdmin(services)
    const { resetGlobalCache, revokeAllSessions, revokeUserSessions } =
      await import('#/server/admin-service.server')
    if (data.action === 'reset-cache') {
      await resetGlobalCache(services.cacheDatabase, data.target)
      return { message: 'Cache cleared', signedOut: false }
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
