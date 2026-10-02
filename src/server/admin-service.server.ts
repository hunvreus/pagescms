import { count, countDistinct, desc, eq, like, or, sql } from 'drizzle-orm'

import { atomicBatch } from './database/core.server'
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
  cacheDatabase: Database,
  input: { query: string; page: number },
) {
  const filter = input.query
    ? or(
        like(sql`lower(${userTable.name})`, `%${input.query.toLowerCase()}%`),
        like(sql`lower(${userTable.email})`, `%${input.query.toLowerCase()}%`),
        like(
          sql`lower(${userTable.githubUsername})`,
          `%${input.query.toLowerCase()}%`,
        ),
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
  const filteredCountQuery = database.select({ count: count() }).from(userTable)
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
    database.select({ count: count() }).from(userTable),
    database
      .select({ count: count() })
      .from(userTable)
      .where(eq(userTable.emailVerified, true)),
    database
      .select({ count: count() })
      .from(accountTable)
      .where(eq(accountTable.providerId, 'github')),
    cacheDatabase.select({ count: count() }).from(githubInstallationTokenTable),
    cacheDatabase
      .select({
        count: countDistinct(
          sql`${configTable.source} || char(0) || ${configTable.owner} || char(0) || ${configTable.repo}`,
        ),
      })
      .from(configTable),
    database.select({ count: count() }).from(collaboratorTable),
    cacheDatabase.select({ count: count() }).from(cacheFileTable),
    cacheDatabase.select({ count: count() }).from(cacheFileMetaTable),
    cacheDatabase.select({ count: count() }).from(cachePermissionTable),
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
  await atomicBatch(database, [
    database.delete(cacheFileTable),
    database.delete(cacheFileMetaTable),
    database.delete(cachePermissionTable),
    database.delete(configTable),
  ])
}
