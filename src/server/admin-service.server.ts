import { count, desc, eq, like, or, sql } from 'drizzle-orm'

import { atomicBatch } from './database/core.server'
import { invalidateEphemeralMediaDirectories } from './directory-cache.server'
import type { Database } from './database/client.server'

import {
  accountTable,
  cacheFileMetaTable,
  cacheFileTable,
  collaboratorTable,
  configTable,
  repositoryTable,
  sessionTable,
  userTable,
} from './database/schema'

const USERS_PER_PAGE = 20

export async function loadAdminDashboard(
  database: Database,
  cacheDatabase: Database,
  input: { query: string; page: number; repoQuery?: string; repoPage?: number },
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
    configCount,
    cacheFileCount,
    cacheMetaCount,
    filteredUserCount,
    users,
  ] = await Promise.all([
    database.select({ count: count() }).from(userTable),
    cacheDatabase.select({ count: count() }).from(configTable),
    cacheDatabase.select({ count: count() }).from(cacheFileTable),
    cacheDatabase.select({ count: count() }).from(cacheFileMetaTable),
    filter ? filteredCountQuery.where(filter) : filteredCountQuery,
    usersQuery
      .orderBy(desc(userTable.createdAt))
      .limit(USERS_PER_PAGE)
      .offset((input.page - 1) * USERS_PER_PAGE),
  ])
  const metric = (rows: Array<{ count: number }>) =>
    Number(rows.at(0)?.count ?? 0)
  const matchingUsers = metric(filteredUserCount)
  const repoQuery = input.repoQuery ?? ''
  const repoPage = input.repoPage ?? 1
  const repoFilter = repoQuery
    ? like(
        sql`lower(${repositoryTable.owner} || '/' || ${repositoryTable.repo})`,
        `%${repoQuery.toLowerCase()}%`,
      )
    : undefined
  const [repoCount, repositories] = await Promise.all([
    database.select({ count: count() }).from(repositoryTable).where(repoFilter),
    database
      .select({
        source: repositoryTable.source,
        owner: repositoryTable.owner,
        repo: repositoryTable.repo,
        lastOpenedAt: repositoryTable.lastOpenedAt,
        collaborators: sql<number>`(select count(*) from ${collaboratorTable} where lower(${collaboratorTable.owner}) = ${repositoryTable.owner} and lower(${collaboratorTable.repo}) = ${repositoryTable.repo})`,
      })
      .from(repositoryTable)
      .where(repoFilter)
      .orderBy(desc(repositoryTable.lastOpenedAt))
      .limit(USERS_PER_PAGE)
      .offset((repoPage - 1) * USERS_PER_PAGE),
  ])
  return {
    metrics: {
      users: metric(userCount),
      configurations: metric(configCount),
      cachedFiles: metric(cacheFileCount),
      cacheMetadata: metric(cacheMetaCount),
    },
    query: input.query,
    pageSize: USERS_PER_PAGE,
    page: input.page,
    pages: Math.max(1, Math.ceil(matchingUsers / USERS_PER_PAGE)),
    matchingUsers,
    repositories: repositories.map((repository) => ({
      ...repository,
      lastOpenedAt: repository.lastOpenedAt.toISOString(),
    })),
    matchingRepositories: metric(repoCount),
    repoQuery,
    repoPage,
    repoPages: Math.max(1, Math.ceil(metric(repoCount) / USERS_PER_PAGE)),
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

export async function resetGlobalCache(
  database: Database,
  target: 'all' | 'content' | 'configuration' = 'all',
) {
  const directories =
    target === 'all' || target === 'content'
      ? await database
          .selectDistinct({
            owner: cacheFileMetaTable.owner,
            repo: cacheFileMetaTable.repo,
            branch: cacheFileMetaTable.branch,
            source: cacheFileMetaTable.source,
          })
          .from(cacheFileMetaTable)
      : []
  const statements = [
    ...(target === 'all' || target === 'content'
      ? [database.delete(cacheFileTable), database.delete(cacheFileMetaTable)]
      : []),
    ...(target === 'all' || target === 'configuration'
      ? [database.delete(configTable)]
      : []),
  ]
  const [first, ...rest] = statements
  await atomicBatch(database, [first, ...rest])
  for (const directory of directories)
    invalidateEphemeralMediaDirectories(
      directory.owner,
      directory.repo,
      directory.branch,
      directory.source,
    )
}
