import { and, eq, sql } from 'drizzle-orm'

import { createConfigurationStore } from './configuration-store.server'
import { DEFAULT_REPOSITORY_SOURCE } from './repository-provider.server'
import {
  createDirectoryCache,
  invalidateDirectoryCache,
} from './directory-cache.server'

import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

import {
  cacheFileMetaTable,
  cacheFileTable,
  configTable,
} from './database/schema'

type CacheInput = {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
}

async function cacheContext(input: CacheInput) {
  if (!input.user.githubUsername) {
    throw new Error('Only GitHub users can manage the cache')
  }
  const { api, tokenSource } = await input.repositoryAccess.resolve(
    input.user,
    input.owner,
    input.repo,
    input.branch,
  )
  if (tokenSource !== 'user') {
    throw new Error('Only GitHub users can manage the cache')
  }
  const repository = await api.getRepository(input.owner, input.repo)
  if (!repository.canPush)
    throw new Error('Repository write access is required')
  const configurationStore = createConfigurationStore({
    database: input.database,
  })
  return { api, configurationStore }
}

function branchConditions(input: CacheInput) {
  return and(
    eq(cacheFileTable.source, DEFAULT_REPOSITORY_SOURCE),
    eq(cacheFileTable.owner, input.owner.toLowerCase()),
    eq(cacheFileTable.repo, input.repo.toLowerCase()),
    eq(cacheFileTable.branch, input.branch),
  )
}

export async function loadCacheStatus(input: CacheInput) {
  await cacheContext(input)
  const normalizedOwner = input.owner.toLowerCase()
  const normalizedRepo = input.repo.toLowerCase()
  const [fileCountRows, directoryCountRows, config] = await Promise.all([
    input.database
      .select({ count: sql<number>`count(*)` })
      .from(cacheFileTable)
      .where(branchConditions(input)),
    input.database
      .select({ count: sql<number>`count(*)` })
      .from(cacheFileMetaTable)
      .where(
        and(
          eq(cacheFileMetaTable.source, DEFAULT_REPOSITORY_SOURCE),
          eq(cacheFileMetaTable.owner, normalizedOwner),
          eq(cacheFileMetaTable.repo, normalizedRepo),
          eq(cacheFileMetaTable.branch, input.branch),
        ),
      ),
    input.database.query.configTable.findFirst({
      where: and(
        eq(configTable.source, DEFAULT_REPOSITORY_SOURCE),
        sql`lower(${configTable.owner}) = lower(${input.owner})`,
        sql`lower(${configTable.repo}) = lower(${input.repo})`,
        eq(configTable.branch, input.branch),
      ),
    }),
  ])
  return {
    fileCount: Number(fileCountRows.at(0)?.count ?? 0),
    configuration: config
      ? {
          sha: config.sha,
          version: config.version,
          lastCheckedAt: config.lastCheckedAt.toISOString(),
        }
      : null,
    directoryCount: Number(directoryCountRows.at(0)?.count ?? 0),
  }
}

export type CacheAction =
  | 'reconcile-content'
  | 'clear-content'
  | 'refresh-configuration'
  | 'clear-configuration'
  | 'clear-all'

export async function manageCache(input: CacheInput & { action: CacheAction }) {
  const { api, configurationStore } = await cacheContext(input)
  const normalizedOwner = input.owner.toLowerCase()
  const normalizedRepo = input.repo.toLowerCase()
  if (input.action === 'reconcile-content') {
    const directories = await input.database
      .select({
        path: cacheFileMetaTable.path,
        context: cacheFileMetaTable.context,
      })
      .from(cacheFileMetaTable)
      .where(
        and(
          eq(cacheFileMetaTable.source, DEFAULT_REPOSITORY_SOURCE),
          eq(cacheFileMetaTable.owner, normalizedOwner),
          eq(cacheFileMetaTable.repo, normalizedRepo),
          eq(cacheFileMetaTable.branch, input.branch),
        ),
      )
    const cache = createDirectoryCache({
      database: input.database,
    })
    for (const directory of directories) {
      if (directory.context !== 'collection' && directory.context !== 'media')
        continue
      await cache.refresh({
        api,
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        path: directory.path,
        context: directory.context,
      })
    }
    return { message: 'Content cache reconciled' }
  }
  if (input.action === 'clear-content' || input.action === 'clear-all') {
    await invalidateDirectoryCache(
      input.database,
      input.owner,
      input.repo,
      input.branch,
    )
  }
  if (input.action === 'refresh-configuration') {
    await configurationStore.refresh(api, input.owner, input.repo, input.branch)
  }
  if (input.action === 'clear-configuration' || input.action === 'clear-all') {
    await configurationStore.remove(input.owner, input.repo, input.branch)
  }
  const messages: Record<Exclude<CacheAction, 'reconcile-content'>, string> = {
    'clear-content': 'Content cache cleared',
    'refresh-configuration': 'Configuration cache refreshed',
    'clear-configuration': 'Configuration cache cleared',
    'clear-all': 'All repository caches cleared',
  }
  return { message: messages[input.action] }
}
