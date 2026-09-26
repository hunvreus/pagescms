import { and, eq, sql } from 'drizzle-orm'

import {
  CONFIGURATION_VERSION,
  normalizeConfiguration,
} from '#/lib/configuration'
import { parseConfigurationSource } from '#/lib/configuration-source'
import { toJsonObject } from '#/lib/json'

import type { JsonObject } from '#/lib/json'

import { GitHubApiError } from './github-api.server'

import type { Database } from './database/client.server'
import type { GitHubApi } from './github-api.server'
import type { Clock } from './runtime-ports.server'

import { configTable } from './database/schema'
import { systemClock } from './runtime-ports.server'
import { cachePolicy } from './cache-policy.server'
import { readRepositoryCached } from './repository-read-cache.server'

export interface StoredConfiguration {
  owner: string
  repo: string
  branch: string
  sha: string
  version: string
  object: JsonObject
  lastCheckedAt: Date
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function parseConfigurationFile(encodedContent: string) {
  const source = decodeBase64Utf8(encodedContent)
  const parsed = parseConfigurationSource(source)
  if (parsed.diagnostics.length) {
    throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid .pages.yml')
  }
  return toJsonObject(normalizeConfiguration(parsed.configuration))
}

function rowToConfiguration(
  row: typeof configTable.$inferSelect,
): StoredConfiguration {
  const object = toJsonObject(JSON.parse(row.object))
  return {
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    sha: row.sha,
    version: row.version,
    object,
    lastCheckedAt: row.lastCheckedAt,
  }
}

export function createConfigurationStore({
  database,
  clock = systemClock,
  ttlMs = cachePolicy(database).configMs,
}: {
  database: Database
  clock?: Clock
  ttlMs?: number
}) {
  async function find(owner: string, repo: string, branch: string) {
    const row = await database.query.configTable.findFirst({
      where: and(
        sql`lower(${configTable.owner}) = lower(${owner})`,
        sql`lower(${configTable.repo}) = lower(${repo})`,
        eq(configTable.branch, branch),
      ),
    })
    return row ? rowToConfiguration(row) : null
  }

  async function remove(owner: string, repo: string, branch: string) {
    await database
      .delete(configTable)
      .where(
        and(
          sql`lower(${configTable.owner}) = lower(${owner})`,
          sql`lower(${configTable.repo}) = lower(${repo})`,
          eq(configTable.branch, branch),
        ),
      )
  }

  async function refresh(
    api: GitHubApi,
    owner: string,
    repo: string,
    branch: string,
    cached: StoredConfiguration | null,
  ): Promise<StoredConfiguration | null> {
    // Only publish against the snapshot this request observed. A local save or
    // newer refresh may finish while GitHub is responding.
    const snapshot = and(
      sql`lower(${configTable.owner}) = lower(${owner})`,
      sql`lower(${configTable.repo}) = lower(${repo})`,
      eq(configTable.branch, branch),
      cached ? eq(configTable.sha, cached.sha) : undefined,
      cached ? eq(configTable.lastCheckedAt, cached.lastCheckedAt) : undefined,
      cached ? eq(configTable.version, cached.version) : undefined,
    )
    let file
    try {
      file = await readRepositoryCached(
        api,
        owner,
        repo,
        JSON.stringify(['configuration-file', branch]),
        0,
        () => api.getFile(owner, repo, '.pages.yml', branch),
      )
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        if (cached) await database.delete(configTable).where(snapshot)
        return find(owner, repo, branch)
      }
      throw error
    }

    const checkedAt = clock.now()
    const object =
      cached?.version === CONFIGURATION_VERSION && cached.sha === file.sha
        ? cached.object
        : parseConfigurationFile(file.content)
    const values = {
      sha: file.sha,
      version: CONFIGURATION_VERSION,
      object: JSON.stringify(object),
      lastCheckedAt: checkedAt,
    }
    if (cached) {
      await database.update(configTable).set(values).where(snapshot)
    } else {
      await database
        .insert(configTable)
        .values({
          owner: owner.toLowerCase(),
          repo: repo.toLowerCase(),
          branch,
          ...values,
        })
        .onConflictDoNothing()
    }
    return find(owner, repo, branch)
  }

  async function save(
    owner: string,
    repo: string,
    branch: string,
    sha: string,
    object: JsonObject,
  ): Promise<StoredConfiguration> {
    const checkedAt = clock.now()
    const normalizedOwner = owner.toLowerCase()
    const normalizedRepo = repo.toLowerCase()
    await database
      .insert(configTable)
      .values({
        owner: normalizedOwner,
        repo: normalizedRepo,
        branch,
        sha,
        version: CONFIGURATION_VERSION,
        object: JSON.stringify(object),
        lastCheckedAt: checkedAt,
      })
      .onConflictDoUpdate({
        target: [configTable.owner, configTable.repo, configTable.branch],
        set: {
          sha,
          version: CONFIGURATION_VERSION,
          object: JSON.stringify(object),
          lastCheckedAt: checkedAt,
        },
      })
    return {
      owner: normalizedOwner,
      repo: normalizedRepo,
      branch,
      sha,
      version: CONFIGURATION_VERSION,
      object,
      lastCheckedAt: checkedAt,
    }
  }

  return {
    async get(
      api: GitHubApi,
      owner: string,
      repo: string,
      branch: string,
    ): Promise<StoredConfiguration | null> {
      const cached = await find(owner, repo, branch)
      if (
        cached?.version === CONFIGURATION_VERSION &&
        clock.now().getTime() - cached.lastCheckedAt.getTime() <= ttlMs
      ) {
        return cached
      }
      if (cached?.version === CONFIGURATION_VERSION) {
        return refresh(api, owner, repo, branch, cached)
      }
      return refresh(api, owner, repo, branch, cached)
    },
    async refresh(api: GitHubApi, owner: string, repo: string, branch: string) {
      return refresh(api, owner, repo, branch, await find(owner, repo, branch))
    },
    remove,
    save,
  }
}

export type ConfigurationStore = ReturnType<typeof createConfigurationStore>
