import { AccessDeniedError } from '#/server/access/policy'
import {
  ensureRepositoryIdentity,
  findRepositoryIdentity,
  observeRepositoryIdentity,
} from '#/server/access/repository-identity'
import { collaboratorKey } from '#/lib/collaborator-key'

import { createGitHubApi, GitHubApiError } from '#/server/github/api'
import { DEFAULT_REPOSITORY_SOURCE } from '#/server/repository/provider'
import { createGitHubAppApi } from '#/server/github/app'
import { decryptSecret, encryptSecret } from '#/server/auth/secret-crypto'
import { readInstallationToken } from '#/server/github/installation-token-cache'
import { collaboratorApi } from '#/server/collaborators/api'
import { all, first } from '#/server/db/sql'
import { executeAtomic } from '#/server/db/core'

import type { Database } from '#/server/db/client'
import { createConfigurationReader } from '#/server/cache/configuration-read'
import { createConfigurationStore } from '#/server/cache/configuration'
import type { GitHubApi, GitHubApiFactory } from '#/server/github/api'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { RuntimeConfiguration } from '#/server/runtime-config'
import type { GitHubAccountReader } from '#/server/auth/oauth-account'
import type { ConfigurationRow } from '#/server/cache/configuration'

// Credential choice is a hint, never an authorization grant. Installation
// membership is read again before every mutation, even on a hint hit.
const credentialChoices = new Map<string, 'user' | 'installation'>()
async function credentialKey(token: string, repositoryId: number) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return JSON.stringify([hash, repositoryId])
}
function rememberCredential(key: string, source: 'user' | 'installation') {
  credentialChoices.delete(key)
  credentialChoices.set(key, source)
  if (credentialChoices.size > 512)
    credentialChoices.delete(credentialChoices.keys().next().value!)
}

// Secondary rate limits can arrive as a bare 403 without retry headers.
function rateLimited(error: GitHubApiError) {
  return (
    Boolean(error.retryAfter) ||
    error.status === 429 ||
    /rate limit/i.test(error.message)
  )
}

// Only a non-throttled 401/403/404 means this credential cannot reach the
// repository; rate limits must surface instead of switching credentials.
function lostAccess(error: unknown): error is GitHubApiError {
  return (
    error instanceof GitHubApiError &&
    [401, 403, 404].includes(error.status) &&
    !rateLimited(error)
  )
}

export interface RepositoryAccess {
  /** Metadata already verified during this request's direct-user admission. */
  repository?: Awaited<ReturnType<GitHubApi['getRepository']>>
  api: GitHubApi
  source?: string
  tokenSource: 'user' | 'installation'
  collaboratorKey?: string
  /** Stable core membership row ID. IDs are never reused, even after revocation. */
  membershipId?: string
  /** Local scopes recorded during admission; IDs belong to their own databases. */
  identity?: {
    applicationId: number
    cacheId: number
    externalId: string
    source: string
    configuration?: { branch: string; row: ConfigurationRow | null }
  }
}

export function createRepositoryAccessService(input: {
  database: Database
  cacheDatabase: Database
  githubApp: RuntimeConfiguration['githubApp']
  githubApiFactory?: GitHubApiFactory
  readGitHubAccount: GitHubAccountReader
  waitUntil?: (promise: Promise<unknown>) => void
}) {
  const {
    database,
    cacheDatabase,
    githubApp,
    githubApiFactory = (token, repository) =>
      createGitHubApi(token, fetch, 15_000, 15_000, repository),
    readGitHubAccount,
  } = input
  const resolutions = new Map<string, Promise<RepositoryAccess>>()
  const installationTokens = new Map<number, Promise<string>>()
  const configurationReader = createConfigurationReader()
  const configurationStore = createConfigurationStore({
    database: cacheDatabase,
    waitUntil: input.waitUntil,
    readFile: configurationReader.read,
  })

  async function loadInstallationToken(installationId: number) {
    if (!githubApp) {
      throw new Error(
        'GitHub App credentials are required for collaborator access',
      )
    }
    return readInstallationToken(githubApp.appId, installationId, async () => {
      const cached = await first<{
        ciphertext: string
        iv: string
        expiresAt: number
      }>(
        cacheDatabase,
        'SELECT ciphertext, iv, expires_at AS expiresAt FROM github_installation_token WHERE installation_id = ?',
        [installationId],
      )
      if (cached && Date.now() < cached.expiresAt - 300_000) {
        return {
          value: await decryptSecret(
            cached.ciphertext,
            cached.iv,
            githubApp.cryptoKey,
          ),
          expiresAt: cached.expiresAt,
        }
      }
      const token =
        await createGitHubAppApi(githubApp).createInstallationToken(
          installationId,
        )
      const encrypted = await encryptSecret(token.token, githubApp.cryptoKey)
      await executeAtomic(cacheDatabase, [
        {
          sql: `INSERT INTO github_installation_token (installation_id, ciphertext, iv, expires_at)
            VALUES (?, ?, ?, ?) ON CONFLICT (installation_id) DO UPDATE SET
            ciphertext = excluded.ciphertext, iv = excluded.iv, expires_at = excluded.expires_at`,
          args: [
            installationId,
            encrypted.ciphertext,
            encrypted.iv,
            token.expiresAt.getTime(),
          ],
        },
      ])
      return { value: token.token, expiresAt: token.expiresAt.getTime() }
    })
  }

  function getInstallationToken(installationId: number) {
    let token = installationTokens.get(installationId)
    if (!token) {
      token = loadInstallationToken(installationId)
      installationTokens.set(installationId, token)
      void token.catch(() => installationTokens.delete(installationId))
    }
    return token
  }

  async function resolveWriter(
    token: string,
    owner: string,
    repo: string,
    expectedRepoId?: string,
    fresh = false,
    knownIdentity?: NonNullable<
      Awaited<ReturnType<GitHubAccountReader>>
    >['repositoryIdentity'],
  ): Promise<RepositoryAccess | undefined> {
    const api = githubApiFactory(token)
    try {
      const metadata = await api.getRepository(owner, repo, { fresh })
      if (
        expectedRepoId !== undefined &&
        String(metadata.id) !== expectedRepoId
      ) {
        throw new Error(
          'The repository at this address changed. Reload before continuing.',
        )
      }
      if (!metadata.canPush) return undefined
      const reuseIdentity =
        knownIdentity !== undefined &&
        knownIdentity.source === api.source &&
        knownIdentity.externalId === String(metadata.id) &&
        knownIdentity.ownerId === String(metadata.ownerId) &&
        knownIdentity.owner === metadata.owner &&
        knownIdentity.repo === metadata.repo &&
        owner.toLowerCase() === metadata.owner.toLowerCase() &&
        repo.toLowerCase() === metadata.repo.toLowerCase()
      // Persist only admitted metadata; a readable public repository does not
      // let an unadmitted account create arbitrary identity rows.
      const stores = [...new Set([database, cacheDatabase])]
      const identities = await Promise.all(
        stores.map((store) =>
          store === database && reuseIdentity
            ? knownIdentity
            : observeRepositoryIdentity(
                store,
                { ...metadata, source: api.source },
                { owner, repo },
              ),
        ),
      )
      const applicationId = identities[0].id
      const cacheId = identities[stores.indexOf(cacheDatabase)].id
      return {
        api: githubApiFactory(token, {
          id: metadata.id,
          nodeId: metadata.nodeId,
        }),
        repository: metadata,
        source: DEFAULT_REPOSITORY_SOURCE,
        tokenSource: 'user',
        identity: {
          applicationId,
          cacheId,
          externalId: String(metadata.id),
          source: api.source,
          ...(reuseIdentity &&
            cacheDatabase === database &&
            knownIdentity.configuration && {
              configuration: knownIdentity.configuration,
            }),
        },
      }
    } catch (error) {
      if (!lostAccess(error)) throw error
      return undefined
    }
  }

  async function resolveUncached(
    user: RepositoryUser,
    owner: string,
    repo: string,
    expectedRepoId?: string,
    fresh = false,
    branch?: string,
  ): Promise<RepositoryAccess> {
    const account = await readGitHubAccount(user.id, {
      owner,
      repo,
      ...(cacheDatabase === database && branch && { branch }),
    })
    if (account?.accessToken) {
      const admission = await resolveWriter(
        account.accessToken,
        owner,
        repo,
        expectedRepoId,
        fresh,
        account.repositoryIdentity,
      )
      if (admission) {
        rememberCredential(
          await credentialKey(
            account.accessToken,
            admission.identity?.applicationId ??
              (await ensureRepositoryIdentity(database, { owner, repo })).id,
          ),
          'user',
        )
        return admission
      }
    }

    const admission = await resolveInstallation(
      user,
      owner,
      repo,
      expectedRepoId,
      fresh,
      cacheDatabase === database ? branch : undefined,
    )
    if (account?.accessToken)
      rememberCredential(
        await credentialKey(
          account.accessToken,
          admission.identity.applicationId,
        ),
        'installation',
      )
    return admission
  }

  async function resolveInstallation(
    user: RepositoryUser,
    owner: string,
    repo: string,
    expectedRepoId?: string,
    fresh = false,
    branch?: string,
  ) {
    const readAdmission = () =>
      all<{
        identityId: number
        externalId: string | null
        identityOwnerId: string | null
        identityOwner: string
        identityRepo: string
        id: number | null
        installationId: number | null
        email: string | null
        userId: string | null
        repoId: number | null
        ownerId: number | null
        configRepositoryId: number | null
        configSource: string | null
        configOwner: string | null
        configRepo: string | null
        configSha: string | null
        configVersion: string | null
        configObject: string | null
        configCheckedAt: number | null
      }>(
        database,
        `SELECT r.id AS identityId, r.external_id AS externalId, r.owner_id AS identityOwnerId,
          r.owner AS identityOwner, r.repo AS identityRepo,
          c.id, c.installation_id AS installationId, c.email, c.user_id AS userId,
          c.repo_id AS repoId, c.owner_id AS ownerId,
          config.repository_id AS configRepositoryId, config.source AS configSource,
          config.owner AS configOwner, config.repo AS configRepo, config.sha AS configSha,
          config.version AS configVersion, config.object AS configObject,
          config.last_checked_at AS configCheckedAt
        FROM repository_address a JOIN repository r ON r.id = a.repository_id
        LEFT JOIN collaborator c ON c.repo_id = r.external_id AND c.owner_id = r.owner_id
          AND c.pending = 0 AND (c.user_id = ? OR
            (? = 1 AND c.user_id IS NULL AND lower(c.email) = lower(?)))
        LEFT JOIN config ON config.repository_id = r.id AND config.source = r.source AND config.branch = ?
        WHERE a.source = ? AND a.owner = ? AND a.repo = ? ORDER BY c.id`,
        [
          user.id,
          user.emailVerified === true ? 1 : 0,
          user.email,
          branch ?? null,
          DEFAULT_REPOSITORY_SOURCE,
          owner.toLowerCase(),
          repo.toLowerCase(),
        ],
      )
    let admission = (await readAdmission()).at(0)
    let verifiedCold:
      | {
          installationId: number
          repository: NonNullable<RepositoryAccess['repository']>
        }
      | undefined
    if (!admission?.externalId) {
      const candidates = await all<{
        installationId: number
        repoId: number | null
        ownerId: number | null
      }>(
        database,
        `SELECT installation_id AS installationId, repo_id AS repoId, owner_id AS ownerId
        FROM collaborator WHERE pending = 0 AND (user_id = ? OR
          (? = 1 AND user_id IS NULL AND lower(email) = lower(?)))
        AND lower(owner) = lower(?) AND lower(repo) = lower(?)`,
        [user.id, user.emailVerified === true ? 1 : 0, user.email, owner, repo],
      )
      for (const candidate of candidates) {
        if (candidate.repoId == null) continue
        // Collaborators imported from 2.x may lack provider IDs.

        if (candidate.ownerId == null) continue
        const token = await getInstallationToken(candidate.installationId)
        let repository: NonNullable<RepositoryAccess['repository']>
        try {
          repository = await githubApiFactory(token).getRepository(
            owner,
            repo,
            { fresh: true },
          )
        } catch (error) {
          if (lostAccess(error)) continue
          throw error
        }
        if (
          String(repository.id) !== String(candidate.repoId) ||
          String(repository.ownerId) !== String(candidate.ownerId)
        )
          continue
        if (
          expectedRepoId !== undefined &&
          String(repository.id) !== expectedRepoId
        )
          throw new Error(
            'The repository at this address changed. Reload before continuing.',
          )
        await Promise.all(
          [...new Set([database, cacheDatabase])].map((store) =>
            observeRepositoryIdentity(
              store,
              { ...repository, source: DEFAULT_REPOSITORY_SOURCE },
              { owner, repo },
            ),
          ),
        )
        admission = (await readAdmission()).at(0)
        verifiedCold = { installationId: candidate.installationId, repository }
        break
      }
    }
    const collaborator = admission
    if (
      !collaborator ||
      collaborator.id === null ||
      collaborator.installationId === null ||
      collaborator.email === null
    ) {
      throw new AccessDeniedError(
        { allowed: false, reason: 'permission_denied' },
        `You do not have permission to access "${owner}/${repo}"`,
      )
    }
    const token = await getInstallationToken(collaborator.installationId)
    // The local address map can lag behind a rename and subsequent name reuse.
    // Check the provider identity before exposing an installation-token API.
    const identity = {
      id: collaborator.identityId,
      externalId: collaborator.externalId,
      ownerId: collaborator.identityOwnerId,
      owner: collaborator.identityOwner,
      repo: collaborator.identityRepo,
    }
    if (
      !identity.externalId ||
      !identity.ownerId ||
      collaborator.repoId == null ||
      // Imported 2.x or corrupt rows must fail closed despite the schema type.

      collaborator.ownerId == null ||
      identity.externalId !== String(collaborator.repoId) ||
      identity.ownerId !== String(collaborator.ownerId)
    )
      throw new Error(
        'The repository at this address changed. Reload before continuing.',
      )
    const repository =
      verifiedCold?.installationId === collaborator.installationId
        ? verifiedCold.repository
        : await githubApiFactory(token).getRepository(
            identity.owner,
            identity.repo,
            { fresh },
          )
    if (
      String(repository.id) !== identity.externalId ||
      String(repository.ownerId) !== identity.ownerId ||
      (expectedRepoId !== undefined && String(repository.id) !== expectedRepoId)
    )
      throw new Error(
        'The repository at this address changed. Reload before continuing.',
      )
    const reuseIdentity =
      repository.owner === identity.owner &&
      repository.repo === identity.repo &&
      owner.toLowerCase() === identity.owner.toLowerCase() &&
      repo.toLowerCase() === identity.repo.toLowerCase()
    const stores = [...new Set([database, cacheDatabase])]
    const identities = await Promise.all(
      stores.map((store) =>
        store === database && reuseIdentity
          ? identity
          : observeRepositoryIdentity(
              store,
              { ...repository, source: DEFAULT_REPOSITORY_SOURCE },
              { owner: identity.owner, repo: identity.repo },
            ),
      ),
    )
    if (collaborator.userId === null) {
      const [bound] = await executeAtomic(database, [
        {
          sql: `UPDATE collaborator SET user_id = ? WHERE id = ? AND pending = 0
          AND repo_id = ? AND owner_id = ? AND (user_id = ? OR
            (? = 1 AND user_id IS NULL AND lower(email) = lower(?))) RETURNING id`,
          args: [
            user.id,
            collaborator.id,
            collaborator.repoId,
            collaborator.ownerId,
            user.id,
            user.emailVerified === true ? 1 : 0,
            user.email,
          ],
        },
      ])
      if (!bound.rows.length)
        throw new AccessDeniedError({
          allowed: false,
          reason: 'permission_denied',
        })
    }
    return {
      api: collaboratorApi(
        githubApiFactory(token, {
          id: repository.id,
          nodeId: repository.nodeId,
        }),
      ),
      repository,
      identity: {
        applicationId: identities[0].id,
        cacheId: identities[stores.indexOf(cacheDatabase)].id,
        externalId: String(repository.id),
        source: DEFAULT_REPOSITORY_SOURCE,
        ...(reuseIdentity &&
          branch &&
          cacheDatabase === database && {
            configuration: {
              branch,
              row:
                collaborator.configRepositoryId == null
                  ? null
                  : {
                      repositoryId: collaborator.configRepositoryId,
                      source: collaborator.configSource!,
                      owner: collaborator.configOwner!,
                      repo: collaborator.configRepo!,
                      branch,
                      sha: collaborator.configSha!,
                      version: collaborator.configVersion!,
                      object: collaborator.configObject!,
                      lastCheckedAt: collaborator.configCheckedAt!,
                    },
            },
          }),
      },
      source: DEFAULT_REPOSITORY_SOURCE,
      tokenSource: 'installation' as const,
      collaboratorKey: collaboratorKey(collaborator.email),
      membershipId: String(collaborator.id),
    }
  }

  // A mutation claims its requested address and, once known, its identity, so
  // cold writes need no identity row and aliases still exclude each other.
  function mutationKey(user: RepositoryUser, scope: number | string[]) {
    return [
      user.id,
      user.email.toLowerCase(),
      String(user.emailVerified === true),
      typeof scope === 'number'
        ? String(scope)
        : JSON.stringify(scope.map((part) => part.toLowerCase())),
    ].join('\0')
  }
  const mutations = new Map<
    string,
    { admission: RepositoryAccess; repoId: string | null }
  >()
  const activeMutations = new Set<string>()

  async function findMutation(
    user: RepositoryUser,
    owner: string,
    repo: string,
  ) {
    const byAddress = mutations.get(mutationKey(user, [owner, repo]))
    if (byAddress || !mutations.size) return byAddress
    // Looking for an active mutation must not create rows for an unadmitted read.
    const identity = await findRepositoryIdentity(database, { owner, repo })
    return identity ? mutations.get(mutationKey(user, identity.id)) : undefined
  }

  async function directAdmission(
    user: RepositoryUser,
    owner: string,
    repo: string,
    identity: Awaited<ReturnType<typeof findRepositoryIdentity>>,
    expectedRepoId?: string,
  ): Promise<{ admission: RepositoryAccess; token?: string }> {
    const account = await readGitHubAccount(user.id)
    if (!account?.accessToken)
      return {
        admission: await resolveInstallation(
          user,
          owner,
          repo,
          expectedRepoId,
          true,
        ),
      }
    // Choices are only remembered after admission, which records the identity.
    const choiceKey = identity
      ? await credentialKey(account.accessToken, identity.id)
      : undefined
    const choice = choiceKey ? credentialChoices.get(choiceKey) : undefined
    if (choice === 'installation') {
      try {
        return {
          admission: await resolveInstallation(
            user,
            owner,
            repo,
            expectedRepoId,
            true,
          ),
        }
      } catch (error) {
        if (!(error instanceof AccessDeniedError) && !lostAccess(error))
          throw error
        if (choiceKey) credentialChoices.delete(choiceKey)
      }
    }
    // External providers and hosted quotas rely on this boundary; GitHub's
    // enforcement of repository file writes cannot protect those operations.
    const admission = await resolveWriter(
      account.accessToken,
      owner,
      repo,
      expectedRepoId ?? identity?.externalId ?? undefined,
      true,
    )
    return admission
      ? { admission, token: account.accessToken }
      : {
          admission: await resolveInstallation(
            user,
            owner,
            repo,
            expectedRepoId,
            true,
          ),
        }
  }

  return {
    configurationStore,
    waitUntil: input.waitUntil,
    readConfigurationFile: configurationReader.read,
    clearConfigurationReads: configurationReader.clear,
    // The callback includes principal resolution and application authorization,
    // so a credential fallback can never reuse the first principal's grant.
    async executeMutation<T>(
      user: RepositoryUser,
      repository: {
        owner: string
        repo: string
        branch: string
        repoId?: string
      },
      _kind: 'single' | 'multi',
      operation: () => Promise<T>,
    ): Promise<T> {
      configurationReader.clear()
      const { owner, repo } = repository
      // Rejected owner/repo requests must not leave identity rows behind.
      const identity = await findRepositoryIdentity(database, { owner, repo })
      const keys: string[] = []
      const claim = (...scopes: (number | string[])[]) => {
        const added = scopes
          .map((scope) => mutationKey(user, scope))
          .filter((key) => !keys.includes(key))
        if (added.some((key) => activeMutations.has(key)))
          throw new Error('Repository mutation is already running')
        for (const key of added) activeMutations.add(key)
        keys.push(...added)
      }
      let current: RepositoryAccess | undefined
      const publishAdmission = () => {
        if (!current) return
        const binding = {
          admission: current,
          repoId: current.identity?.externalId ?? null,
        }
        for (const key of keys) mutations.set(key, binding)
      }
      try {
        claim([owner, repo], ...(identity ? [identity.id] : []))
        const { admission } = await directAdmission(
          user,
          owner,
          repo,
          identity,
          repository.repoId,
        )
        current = admission
        if (admission.identity) claim(admission.identity.applicationId)
        publishAdmission()
        return await operation()
      } finally {
        configurationReader.clear()
        for (const key of keys) {
          mutations.delete(key)
          activeMutations.delete(key)
        }
      }
    },
    async forInstallation(
      installationId: number,
      repository?: { id: number; nodeId?: string },
    ) {
      return githubApiFactory(
        await getInstallationToken(installationId),
        repository,
      )
    },
    async resolve(
      user: RepositoryUser,
      owner: string,
      repo: string,
      branch?: string,
      repoId?: string,
    ) {
      const mutation = await findMutation(user, owner, repo)
      if (mutation) {
        if (repoId !== undefined && mutation.repoId !== repoId)
          throw new Error(
            'The repository at this address changed. Reload before continuing.',
          )
        return mutation.admission
      }
      const key = [
        user.id,
        user.email.toLowerCase(),
        String(user.emailVerified === true),
        owner.toLowerCase(),
        repo.toLowerCase(),
      ].join('\0')
      let resolution = resolutions.get(key)
      if (!resolution) {
        resolution = resolveUncached(user, owner, repo, repoId, false, branch)
        resolutions.set(key, resolution)
        void resolution.catch(() => resolutions.delete(key))
      }
      const admission = await resolution
      if (repoId !== undefined && admission.identity?.externalId !== repoId)
        throw new Error(
          'The repository identity does not match. Reload before continuing.',
        )
      return admission
    },
  }
}

export type RepositoryAccessService = Pick<
  ReturnType<typeof createRepositoryAccessService>,
  'resolve'
> &
  Partial<
    Pick<
      ReturnType<typeof createRepositoryAccessService>,
      | 'readConfigurationFile'
      | 'clearConfigurationReads'
      | 'waitUntil'
      | 'configurationStore'
    >
  >
