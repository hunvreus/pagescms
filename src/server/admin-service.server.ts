import { desc, eq, ilike, or, sql } from 'drizzle-orm'

import type { Database } from './database/client.server'

import {
  accountTable,
  cacheFileMetaTable,
  cacheFileTable,
  cachePermissionTable,
  collaboratorTable,
  configTable,
  githubInstallationTokenTable,
  sessionTable,
  userTable,
} from './database/schema'

const USERS_PER_PAGE = 20

export async function loadAdminDashboard(
  database: Database,
  input: { query: string; page: number },
) {
  const filter = input.query
    ? or(
        ilike(userTable.name, `%${input.query}%`),
        ilike(userTable.email, `%${input.query}%`),
        ilike(userTable.githubUsername, `%${input.query}%`),
      )
    : undefined
  const usersBase = database
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      emailVerified: userTable.emailVerified,
      githubUsername: userTable.githubUsername,
      createdAt: userTable.createdAt,
      updatedAt: userTable.updatedAt,
      githubLinked: sql<boolean>`exists (
        select 1 from ${accountTable}
        where ${accountTable.userId} = ${userTable.id}
          and ${accountTable.providerId} = 'github'
      )`,
    })
    .from(userTable)
  const usersQuery = filter ? usersBase.where(filter) : usersBase
  const filteredCountQuery = database
    .select({ count: sql<number>`count(*)::int` })
    .from(userTable)
  const [
    userCount,
    verifiedUserCount,
    githubUserCount,
    installationCount,
    repositoryCount,
    collaboratorCount,
    cacheFileCount,
    cacheMetaCount,
    cachePermissionCount,
    filteredUserCount,
    users,
  ] = await Promise.all([
    database.select({ count: sql<number>`count(*)::int` }).from(userTable),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(userTable)
      .where(eq(userTable.emailVerified, true)),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(accountTable)
      .where(eq(accountTable.providerId, 'github')),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(githubInstallationTokenTable),
    database
      .select({
        count: sql<number>`count(distinct (${configTable.owner}, ${configTable.repo}))::int`,
      })
      .from(configTable),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(collaboratorTable),
    database.select({ count: sql<number>`count(*)::int` }).from(cacheFileTable),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(cacheFileMetaTable),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(cachePermissionTable),
    filter ? filteredCountQuery.where(filter) : filteredCountQuery,
    usersQuery
      .orderBy(desc(userTable.createdAt))
      .limit(USERS_PER_PAGE)
      .offset((input.page - 1) * USERS_PER_PAGE),
  ])
  const metric = (rows: Array<{ count: number }>) =>
    Number(rows.at(0)?.count ?? 0)
  const matchingUsers = metric(filteredUserCount)
  return {
    metrics: {
      users: metric(userCount),
      verifiedUsers: metric(verifiedUserCount),
      githubUsers: metric(githubUserCount),
      installations: metric(installationCount),
      repositories: metric(repositoryCount),
      collaborators: metric(collaboratorCount),
      cachedFiles: metric(cacheFileCount),
      cacheMetadata: metric(cacheMetaCount),
      cachedPermissions: metric(cachePermissionCount),
    },
    query: input.query,
    page: input.page,
    pages: Math.max(1, Math.ceil(matchingUsers / USERS_PER_PAGE)),
    matchingUsers,
    users: users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    })),
  }
}

export async function revokeUserSessions(database: Database, userId: string) {
  await database.delete(sessionTable).where(eq(sessionTable.userId, userId))
}

export async function revokeAllSessions(database: Database) {
  await database.delete(sessionTable)
}

export async function resetGlobalCache(database: Database) {
  await database.transaction(async (transaction) => {
    await transaction.delete(cacheFileTable)
    await transaction.delete(cacheFileMetaTable)
    await transaction.delete(cachePermissionTable)
    await transaction.delete(configTable)
  })
}
