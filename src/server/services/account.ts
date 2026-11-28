import { isDeploymentAdmin } from '#/server/admin/access'
import {
  loadAccountSettings,
  updateAccountProfile,
} from '#/server/account/account'
import {
  readAccountPreferences,
  updateAccountPreferences,
} from '#/server/account/preferences'
import { deleteCurrentAccount } from '#/server/account/deletion'
import { UserError } from '#/server/http'
import type { RequestServices } from '#/server/context'
import type { ServiceUser } from '#/server/services/context'
import type {
  parseProfileMutation,
  parseAccountDeletion,
  parseAccountId,
} from '#/shared/requests/account'
import type { parsePreferencesUpdate } from '#/shared/account-preferences'

function policy(userId: string, operation: 'account.read' | 'account.update') {
  return {
    operation,
    principal: { type: 'user' as const, id: userId },
    tenant: { type: 'account' as const, id: userId },
  }
}
function checkAccount(user: ServiceUser, accountId: string) {
  if (user.id !== accountId)
    throw new UserError('Your signed-in account changed. Reload and try again.')
}
export async function readSettings(
  services: RequestServices,
  user: ServiceUser,
) {
  return services.access.execute(policy(user.id, 'account.read'), () =>
    loadAccountSettings({
      database: services.database,
      repositories: services.repositories,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image ?? null,
        githubUsername: user.githubUsername ?? null,
      },
      githubClientId: services.configuration.auth.github?.clientId,
      githubAppName: services.configuration.githubAppName,
      isAdmin: isDeploymentAdmin(user, services.configuration.adminEmails),
    }),
  )
}
export async function saveProfile(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseProfileMutation>,
) {
  checkAccount(user, data.accountId)
  const { accountId: _accountId, ...profile } = data
  return services.access.execute(policy(user.id, 'account.update'), () =>
    updateAccountProfile(services.database, user.id, profile),
  )
}
export async function readPreferences(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseAccountId>,
) {
  checkAccount(user, data.accountId)
  return services.access.execute(policy(user.id, 'account.read'), () =>
    readAccountPreferences(services.database, user.id),
  )
}
export async function savePreferences(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parsePreferencesUpdate>,
) {
  checkAccount(user, data.accountId)
  return services.access.execute(policy(user.id, 'account.update'), () =>
    updateAccountPreferences(services.database, user.id, data.editing),
  )
}
export async function deleteAccount(
  services: RequestServices,
  _user: ServiceUser,
  data: ReturnType<typeof parseAccountDeletion>,
) {
  return deleteCurrentAccount(services, data)
}
