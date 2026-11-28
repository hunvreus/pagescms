import { decodeBase64Utf8, encodeBase64Utf8 } from '#/lib/base64'
import { UserError, logServerEvent, serverErrorDetails } from '#/server/http'
import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import {
  CONFIGURATION_VERSION,
  normalizeConfiguration,
} from '#/shared/configuration'
import {
  parseConfigurationSource,
  validateConfigurationSource,
} from '#/shared/configuration-source'
import { toJsonObject } from '#/shared/json'

import { configurationStoreFor } from '#/server/cache/configuration-access'
import {
  findRepositoryIdentityByExternalId,
  observeRepositoryIdentity,
} from '#/server/access/repository-identity'
import { withContentConflict } from '#/server/content/conflict'
import { requireRepositoryManager } from '#/server/access/repository-policy'
import { updateRepositoryCacheAfterMutation } from '#/server/cache/repository'
import {
  isRepositoryProviderError,
  repositorySource,
} from '#/server/repository/provider'
import { invalidateRepositoryReads } from '#/server/cache/repository-read'

import type { JsonObject } from '#/shared/json'
import type { ConfigurationStore } from '#/server/cache/configuration'
import type { Database } from '#/server/db/client'
import type { RepositoryApi } from '#/server/repository/provider'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { RepositoryAccessService } from '#/server/access/repository'

// Commit settings come from the configuration being replaced. A malformed
// remote file must not block saving its repair. Parse and normalization errors
// use defaults; provider and database errors propagate.
async function loadReplacedConfiguration(
  store: ConfigurationStore,
  api: RepositoryApi,
  owner: string,
  repo: string,
  branch: string,
  sha: string | null,
  repositoryId: number,
): Promise<JsonObject | undefined> {
  if (!sha) return undefined
  const cached = await store.find(
    owner,
    repo,
    branch,
    repositorySource(api),
    repositoryId,
  )
  if (cached?.version === CONFIGURATION_VERSION && cached.sha === sha) {
    return cached.object
  }
  let file
  try {
    file = await api.getFile(owner, repo, '.pages.yml', branch)
  } catch (error) {
    if (isRepositoryProviderError(error, 404)) return undefined
    throw error
  }
  const parsed = parseConfigurationSource(decodeBase64Utf8(file.content))
  if (parsed.diagnostics.length) return undefined
  try {
    return toJsonObject(normalizeConfiguration(parsed.configuration))
  } catch {
    // Invalid old component definitions must not prevent saving their repair.
    return undefined
  }
}

export async function loadConfigurationSource({
  repositoryAccess,
  user,
  owner,
  repo,
  branch,
  repoId,
}: {
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  branch: string
  repoId?: string
}) {
  const { api } = await repositoryAccess.resolve(
    user,
    owner,
    repo,
    branch,
    repoId,
  )
  try {
    const file = await (repositoryAccess.readConfigurationFile
      ? repositoryAccess.readConfigurationFile(api, owner, repo, branch)
      : api.getFile(owner, repo, '.pages.yml', branch))
    return { source: decodeBase64Utf8(file.content), sha: file.sha }
  } catch (error) {
    if (isRepositoryProviderError(error, 404)) {
      return { source: '', sha: null }
    }
    throw error
  }
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
  repoId,
}: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser & { name: string }
  owner: string
  repo: string
  branch: string
  source: string
  sha: string | null
  repoId?: string
}) {
  if (new TextEncoder().encode(source).byteLength > 1_000_000) {
    throw new UserError('Configuration source exceeds the 1 MB limit')
  }
  const parsed = validateConfigurationSource(source)
  const validationError = parsed.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  )
  if (validationError) {
    throw new UserError(validationError.message)
  }
  const normalized = toJsonObject(normalizeConfiguration(parsed.configuration))

  const {
    api,
    repository,
    identity: admittedIdentity,
  } = await requireRepositoryManager(repositoryAccess, user, {
    owner,
    repo,
    branch,
    repoId,
  })
  const store = configurationStoreFor(repositoryAccess, database)
  const providerSource = repositorySource(api)
  // Cache IDs are local to the cache database, which may differ from the application database.
  const cacheIdentity =
    (admittedIdentity && { id: admittedIdentity.cacheId }) ??
    (await findRepositoryIdentityByExternalId(
      database,
      String(repository.id),
      providerSource,
    )) ??
    (await observeRepositoryIdentity(database, {
      ...repository,
      source: providerSource,
    }))
  const replaced = await loadReplacedConfiguration(
    store,
    api,
    owner,
    repo,
    branch,
    sha,
    cacheIdentity.id,
  )
  const action = sha ? 'update' : 'create'
  const identity = resolveCommitIdentity({ configuration: replaced })
  const message = resolveCommitMessage({
    configuration: replaced,
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
  repositoryAccess.clearConfigurationReads?.()
  let result: Awaited<ReturnType<RepositoryApi['putFile']>>
  try {
    result = await withContentConflict(() =>
      api.putFile({
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
      }),
    )
  } finally {
    repositoryAccess.clearConfigurationReads?.()
    // Also detach older reads if the provider accepted the write but the
    // response was lost. They must not publish stale configuration afterward.
    invalidateRepositoryReads(owner, repo, providerSource)
    if (repository.owner !== owner || repository.repo !== repo)
      invalidateRepositoryReads(
        repository.owner,
        repository.repo,
        providerSource,
      )
  }
  try {
    await store.save(
      owner,
      repo,
      branch,
      result.sha,
      normalized,
      providerSource,
      cacheIdentity.id,
    )
  } catch (error) {
    // The remote commit succeeded; a cache failure must not invite a duplicate save.
    logServerEvent('error', {
      event: 'configuration_cache_write_failed',
      owner,
      repo,
      branch,
      source: providerSource,
      ...serverErrorDetails(error),
    })
    await store
      .remove(owner, repo, branch, providerSource, cacheIdentity.id)
      .catch(() => {})
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
    cacheIdentity.id,
  )
  return result
}
