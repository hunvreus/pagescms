import type { Database } from '#/server/db/client'

export type CachePolicy = {
  checkMs: number
  configCheckMs: number
  fileMs: number
  branchHeadMs: number
  repositoryMs: number
  incrementalMax: number
  scopedMax: number
}
export const defaultCachePolicy: CachePolicy = {
  checkMs: 5 * 60_000,
  configCheckMs: 5 * 60_000,
  fileMs: 1440 * 60_000,
  branchHeadMs: 15_000,
  repositoryMs: 15_000,
  incrementalMax: 120,
  scopedMax: 800,
}
const policies = new WeakMap<Database, CachePolicy>()
export function cachePolicy(database: Database) {
  return policies.get(database) ?? defaultCachePolicy
}
export function configureCachePolicy(database: Database, policy: CachePolicy) {
  policies.set(database, policy)
}
export function parseCachePolicy(environment: unknown): CachePolicy {
  const env = (
    typeof environment === 'object' && environment !== null ? environment : {}
  ) as Record<string, unknown>
  function value(
    key: string,
    fallback: number,
    multiplier = 1,
    allowDisabled = false,
  ) {
    const raw =
      key === 'CONFIG_CHECK_MIN'
        ? env.CONFIG_CHECK_MIN || env.CFG_CHECK_MIN || env.CONFIG_CHECK_TTL
        : env[key]
    if (raw === undefined || raw === '') return fallback
    const parsed = Number(raw)
    if (!Number.isSafeInteger(parsed) || parsed < (allowDisabled ? -1 : 0))
      throw new Error(
        `${key} must be a non-negative integer${allowDisabled ? ' or -1' : ''}`,
      )
    return parsed === -1 ? -1 : parsed * multiplier
  }
  return {
    checkMs: value('CACHE_CHECK_MIN', defaultCachePolicy.checkMs, 60_000),
    configCheckMs: value(
      'CONFIG_CHECK_MIN',
      defaultCachePolicy.configCheckMs,
      60_000,
    ),
    fileMs: value('FILE_TTL_MIN', defaultCachePolicy.fileMs, 60_000, true),
    branchHeadMs: value('BRANCH_HEAD_TTL_MS', defaultCachePolicy.branchHeadMs),
    repositoryMs: value('REPO_META_TTL_MS', defaultCachePolicy.repositoryMs),
    incrementalMax: value(
      'WEBHOOK_PUSH_INCREMENTAL_MAX_FILES',
      defaultCachePolicy.incrementalMax,
    ),
    scopedMax: value(
      'WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES',
      defaultCachePolicy.scopedMax,
    ),
  }
}
