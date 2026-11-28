import { AccessDeniedError } from '#/server/access/policy'
import { isDeploymentAdmin } from '#/server/admin/access'
import {
  loadAllowlist,
  changeAllowlist,
} from '#/server/admin/sign-in-allowlist'
import type {
  parseAllowlistAction,
  parseAllowlistSearch,
  parseAdminSearch,
  parseAdminAction,
} from '#/shared/requests/admin'
import {
  loadAdminDashboard,
  resetGlobalCache,
  revokeAllSessions,
  revokeUserSessions,
} from '#/server/admin/admin'
import type { RequestServices } from '#/server/context'
import type { ServiceUser } from '#/server/services/context'

async function requireAdmin(services: RequestServices, user: ServiceUser) {
  if (!isDeploymentAdmin(user, services.configuration.adminEmails)) {
    throw new AccessDeniedError(
      { allowed: false, reason: 'permission_denied' },
      'Admin access required',
    )
  }
  await services.access.authorize({
    operation: 'admin.access',
    principal: { type: 'user', id: user.id },
    tenant: { type: 'deployment', id: services.configuration.auth.baseUrl },
  })
  return user
}

export async function readAdminDashboard(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseAdminSearch>,
) {
  await requireAdmin(services, user)
  const dashboard = await loadAdminDashboard(
    services.database,
    services.cacheDatabase,
    data,
  )
  return {
    ...dashboard,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      githubUsername: user.githubUsername ?? null,
    },
  }
}

export async function executeAdminAction(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseAdminAction>,
) {
  await requireAdmin(services, user)
  if (data.action === 'reset-cache') {
    await resetGlobalCache(services.cacheDatabase, data.target)
    return { message: 'Cache cleared', signedOut: false }
  }
  if (data.action === 'revoke-all') {
    await revokeAllSessions(
      services.database,
      services.revokeCredentials?.(null),
    )
    return { message: 'All sessions revoked', signedOut: true }
  }
  if (!data.userId) throw new Error('Admin user id is required')
  await revokeUserSessions(
    services.database,
    data.userId,
    services.revokeCredentials?.(data.userId),
  )
  return {
    message: 'User sessions revoked',
    signedOut: data.userId === user.id,
  }
}

export async function readSignInAllowlist(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseAllowlistSearch>,
) {
  await requireAdmin(services, user)
  return loadAllowlist(services.database, data)
}

export async function changeSignInAllowlist(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseAllowlistAction>,
) {
  await requireAdmin(services, user)
  await changeAllowlist(services.database, data)
  return null
}
