import { and, eq, sql } from 'drizzle-orm'

import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import { normalizeConfiguration } from '#/lib/configuration'
import { parseConfigurationSource } from '#/lib/configuration-source'

import { createConfigurationStore } from './configuration-store.server'
import { GitHubApiError } from './github-api.server'

import type { Database } from './database/client.server'
import type { BackgroundExecutor } from './runtime-ports.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

import { configTable } from './database/schema'

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  )
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function loadConfigurationSource({
  repositoryAccess,
  user,
  owner,
  repo,
  branch,
}: {
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
}) {
  const { api } = await repositoryAccess.resolve(user, owner, repo, branch)
  try {
    const file = await api.getFile(owner, repo, '.pages.yml', branch)
    return { source: decodeBase64Utf8(file.content), sha: file.sha }
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return { source: '', sha: null }
    }
    throw error
  }
}

export async function saveConfigurationSource({
  database,
  background,
  repositoryAccess,
  user,
  owner,
  repo,
  branch,
  source,
  sha,
}: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser & { name: string }
  owner: string
  repo: string
  branch: string
  source: string
  sha: string | null
}) {
  if (source.length > 1_000_000) {
    throw new Error('Configuration source exceeds the 1 MB limit')
  }
  const parsed = parseConfigurationSource(source)
  if (parsed.diagnostics.length) {
    throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid .pages.yml')
  }
  const { ConfigurationSchema } = await import('#/lib/configuration-schema')
  ConfigurationSchema.parse(parsed.configuration)
  normalizeConfiguration(parsed.configuration)

  const { api } = await repositoryAccess.resolve(user, owner, repo, branch)
  const cached = await createConfigurationStore({
    database,
    background,
  }).get(api, owner, repo, branch)
  const action = sha ? 'update' : 'create'
  const identity = resolveCommitIdentity({ configuration: cached?.object })
  const message = resolveCommitMessage({
    configuration: cached?.object,
    action,
    tokens: buildCommitTokens({
      action,
      owner,
      repo,
      branch,
      path: '.pages.yml',
      contentName: 'configuration',
      user: user.email,
      userName: user.name,
      userEmail: user.email,
    }),
  })
  const result = await api.putFile({
    owner,
    repo,
    branch,
    path: '.pages.yml',
    content: encodeBase64Utf8(source),
    message,
    ...(sha ? { sha } : {}),
    ...(identity === 'user'
      ? { committer: { name: user.name || user.email, email: user.email } }
      : {}),
  })
  await database
    .delete(configTable)
    .where(
      and(
        sql`lower(${configTable.owner}) = lower(${owner})`,
        sql`lower(${configTable.repo}) = lower(${repo})`,
        eq(configTable.branch, branch),
      ),
    )
  return result
}
