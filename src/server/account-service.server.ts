import { and, eq } from 'drizzle-orm'

import type { Database } from './database/client.server'
import type { ProjectService, ProjectUser } from './projects.server'

import { accountTable, userTable } from './database/schema'

export async function loadAccountSettings(input: {
  database: Database
  projects: ProjectService
  user: ProjectUser & { name: string; image: string | null }
  githubClientId?: string
  githubAppName?: string
  isAdmin: boolean
}) {
  const githubAccount = await input.database.query.accountTable.findFirst({
    columns: { id: true },
    where: and(
      eq(accountTable.userId, input.user.id),
      eq(accountTable.providerId, 'github'),
    ),
  })
  const githubConnected = Boolean(githubAccount)
  return {
    user: input.user,
    githubConnected,
    githubAccountId: githubAccount?.id ?? null,
    githubAvailable: Boolean(input.githubClientId),
    githubAppInstallAvailable: Boolean(input.githubAppName),
    isAdmin: input.isAdmin,
    githubManageUrl: input.githubClientId
      ? `https://github.com/settings/connections/applications/${input.githubClientId}`
      : null,
    accounts: githubConnected
      ? await input.projects.listAccounts(input.user)
      : [],
  }
}

export async function updateAccountProfile(
  database: Database,
  userId: string,
  name: string,
) {
  await database
    .update(userTable)
    .set({ name, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  return { name }
}
