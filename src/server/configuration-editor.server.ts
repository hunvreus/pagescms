import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import { normalizeConfiguration } from '#/lib/configuration'
import { validateConfigurationSource } from '#/lib/configuration-source'
import { toJsonObject } from '#/lib/json'

import { createConfigurationStore } from './configuration-store.server'
import { updateRepositoryCacheAfterMutation } from './repository-cache.server'
import { isRepositoryProviderError } from './repository-provider.server'
import { logServerEvent, serverErrorDetails } from './http'

import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

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
    if (isRepositoryProviderError(error, 404)) {
      return { source: '', sha: null }
    }
    throw error
  }
}

export async function loadConfigurationHistory({
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
  return api.listFileCommits(owner, repo, branch, '.pages.yml')
}

export async function saveConfigurationSource({
  database,
  repositoryAccess,
  user,
  owner,
  repo,
  branch,
  source,
  sha,
}: {
  database: Database
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
  const parsed = validateConfigurationSource(source)
  const validationError = parsed.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  )
  if (validationError) {
    throw new Error(validationError.message)
  }
  const normalized = toJsonObject(normalizeConfiguration(parsed.configuration))

  const { api } = await repositoryAccess.resolve(user, owner, repo, branch)
  const cached = await createConfigurationStore({
    database,
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
  const store = createConfigurationStore({ database })
  try {
    await store.save(owner, repo, branch, result.sha, normalized)
  } catch (error) {
    // The remote commit succeeded; a cache failure must not invite a duplicate save.
    logServerEvent('error', {
      event: 'configuration_cache_write_failed',
      owner,
      repo,
      branch,
      ...serverErrorDetails(error),
    })
    await store.remove(owner, repo, branch).catch(() => {})
  }
  await updateRepositoryCacheAfterMutation(
    database,
    api,
    owner,
    repo,
    branch,
    result,
    [{ path: '.pages.yml', removed: false }],
    [
      {
        path: '.pages.yml',
        name: '.pages.yml',
        type: 'file',
        sha: result.sha,
        content: source,
        size: new TextEncoder().encode(source).byteLength,
        downloadUrl: null,
      },
    ],
  )
  return result
}
