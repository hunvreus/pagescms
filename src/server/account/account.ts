import type { Database } from '#/server/db/client'
import type { userTable } from '#/server/db/schema'
import type {
  RepositoryService,
  RepositoryUser,
} from '../repository/repositories'
import type { ProfileUpdate } from '#/lib/profile'

import { first } from '#/server/db/sql'
import { readAccountPreferences } from './preferences'

export async function loadAccountSettings(input: {
  database: Database
  repositories: RepositoryService
  user: RepositoryUser & { name: string; image: string | null }
  githubClientId?: string
  githubAppName?: string
  isAdmin: boolean
}) {
  const [{ accounts, githubAccountId }, preferences] = await Promise.all([
    input.repositories.getAccountAccess(input.user),
    readAccountPreferences(input.database, input.user.id),
  ])
  const githubConnected = githubAccountId !== null
  return {
    user: input.user,
    preferences,
    githubConnected,
    githubAccountId,
    githubAvailable: Boolean(input.githubClientId),
    githubAppInstallAvailable: Boolean(input.githubAppName),
    isAdmin: input.isAdmin,
    githubManageUrl: input.githubClientId
      ? `https://github.com/settings/connections/applications/${input.githubClientId}`
      : null,
    accounts: githubConnected ? accounts : [],
  }
}

export async function updateAccountProfile(
  database: Database,
  userId: string,
  profile: ProfileUpdate,
) {
  const now = Date.now()
  const user = await first<
    Pick<typeof userTable.$inferSelect, 'name' | 'image'>
  >(
    database,
    `UPDATE user SET name = ?, ${profile.image !== undefined ? 'image = ?,' : ''} updated_at = ?, onboarding_completed_at = coalesce(onboarding_completed_at, ?) WHERE id = ? RETURNING name, image`,
    [
      profile.name,
      ...(profile.image !== undefined ? [profile.image] : []),
      now,
      now,
      userId,
    ],
  )
  if (!user) throw new Error('Account not found')
  return user
}
