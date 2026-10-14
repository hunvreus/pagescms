import { collaboratorKey } from '#/lib/collaborator-key'
import { and, eq, isNull, or, sql } from 'drizzle-orm'

import {
  accountTable,
  collaboratorTable,
  githubInstallationTokenTable,
} from './database/schema'
import { createGitHubApi, GitHubApiError } from './github-api.server'
import { DEFAULT_REPOSITORY_SOURCE } from './repository-provider.server'
import { createGitHubAppApi } from './github-app.server'
import { decryptSecret, encryptSecret } from './secret-crypto.server'
import { collaboratorApi } from './collaborator-api.server'

import type { Database } from './database/client.server'
import type { GitHubApi, GitHubApiFactory } from './github-api.server'
import type { ProjectUser } from './projects.server'
import type { RuntimeConfiguration } from './runtime-config.server'

// Credential choice is a hint, never an authorization grant. Installation
// membership is read again before every mutation, even on a hint hit.
const credentialChoices = new Map<string, 'user' | 'installation'>()
async function credentialKey(token: string, owner: string, repo: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return JSON.stringify([hash, owner.toLowerCase(), repo.toLowerCase()])
}
function rememberCredential(key: string, source: 'user' | 'installation') {
  credentialChoices.delete(key)
  credentialChoices.set(key, source)
  if (credentialChoices.size > 512)
    credentialChoices.delete(credentialChoices.keys().next().value!)
}

export interface RepositoryAccess {
  api: GitHubApi
  source?: string
  tokenSource: 'user' | 'installation'
  collaboratorKey?: string
}

function collaboratorMatches(user: ProjectUser, owner: string, repo: string) {
  return and(
    or(
      eq(collaboratorTable.userId, user.id),
      user.emailVerified === true
        ? and(
            isNull(collaboratorTable.userId),
            sql`lower(${collaboratorTable.email}) = lower(${user.email})`,
          )
        : undefined,
    ),
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
  )
}

export function createRepositoryAccessService(input: {
  database: Database
  cacheDatabase: Database
  githubApp: RuntimeConfiguration['githubApp']
  githubApiFactory?: GitHubApiFactory
}) {
  const {
    database,
    cacheDatabase,
    githubApp,
    githubApiFactory = createGitHubApi,
  } = input
  const resolutions = new Map<string, Promise<RepositoryAccess>>()
  const installationTokens = new Map<number, Promise<string>>()

  async function loadInstallationToken(installationId: number) {
    if (!githubApp) {
      throw new Error(
        'GitHub App credentials are required for collaborator access',
      )
    }
    const cached =
      await cacheDatabase.query.githubInstallationTokenTable.findFirst({
        where: eq(githubInstallationTokenTable.installationId, installationId),
      })
    if (cached && Date.now() < cached.expiresAt.getTime() - 60_000) {
      return decryptSecret(cached.ciphertext, cached.iv, githubApp.cryptoKey)
    }

    const token =
      await createGitHubAppApi(githubApp).createInstallationToken(
        installationId,
      )
    const encrypted = await encryptSecret(token.token, githubApp.cryptoKey)
    await cacheDatabase
      .insert(githubInstallationTokenTable)
      .values({
        ...encrypted,
        installationId,
        expiresAt: token.expiresAt,
      })
      .onConflictDoUpdate({
        target: githubInstallationTokenTable.installationId,
        set: { ...encrypted, expiresAt: token.expiresAt },
      })
    return token.token
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

  async function resolveUncached(
    user: ProjectUser,
    owner: string,
    repo: string,
  ) {
    const account = await database.query.accountTable.findFirst({
      columns: { accessToken: true },
      where: and(
        eq(accountTable.userId, user.id),
        eq(accountTable.providerId, 'github'),
      ),
    })
    if (account?.accessToken) {
      const api = githubApiFactory(account.accessToken)
      try {
        await api.getRepository(owner, repo)
        rememberCredential(
          await credentialKey(account.accessToken, owner, repo),
          'user',
        )
        return {
          api,
          source: DEFAULT_REPOSITORY_SOURCE,
          tokenSource: 'user' as const,
        }
      } catch (error) {
        if (
          !(error instanceof GitHubApiError) ||
          ![401, 403, 404].includes(error.status)
        ) {
          throw error
        }
      }
    }

    const admission = await resolveInstallation(user, owner, repo)
    if (account?.accessToken)
      rememberCredential(
        await credentialKey(account.accessToken, owner, repo),
        'installation',
      )
    return admission
  }

  async function resolveInstallation(
    user: ProjectUser,
    owner: string,
    repo: string,
  ) {
    const collaborators = await database.query.collaboratorTable.findMany({
      columns: { installationId: true, email: true },
      where: collaboratorMatches(user, owner, repo),
    })
    const collaborator = collaborators.at(0)
    if (!collaborator) {
      throw new Error(`You do not have permission to access "${owner}/${repo}"`)
    }
    const token = await getInstallationToken(collaborator.installationId)
    return {
      api: collaboratorApi(githubApiFactory(token)),
      source: DEFAULT_REPOSITORY_SOURCE,
      tokenSource: 'installation' as const,
      collaboratorKey: collaboratorKey(collaborator.email),
    }
  }

  function mutationKey(user: ProjectUser, owner: string, repo: string) {
    return [
      user.id,
      user.email.toLowerCase(),
      String(user.emailVerified === true),
      owner.toLowerCase(),
      repo.toLowerCase(),
    ].join('\0')
  }
  const mutations = new Map<string, RepositoryAccess>()
  const activeMutations = new Set<string>()

  async function directAdmission(
    user: ProjectUser,
    owner: string,
    repo: string,
    kind: 'single' | 'multi',
  ): Promise<RepositoryAccess & { choiceKey?: string }> {
    const account = await database.query.accountTable.findFirst({
      columns: { accessToken: true },
      where: and(
        eq(accountTable.userId, user.id),
        eq(accountTable.providerId, 'github'),
      ),
    })
    if (!account?.accessToken) return resolveInstallation(user, owner, repo)
    const choiceKey = await credentialKey(account.accessToken, owner, repo)
    // A cold multi-write operation cannot safely discover credentials by retry.
    if (kind === 'multi' && !credentialChoices.has(choiceKey))
      return resolveUncached(user, owner, repo)
    if (credentialChoices.get(choiceKey) === 'installation')
      return resolveInstallation(user, owner, repo)
    return {
      api: githubApiFactory(account.accessToken),
      source: DEFAULT_REPOSITORY_SOURCE,
      tokenSource: 'user' as const,
      choiceKey,
    }
  }

  return {
    // The callback includes principal resolution and application authorization,
    // so a credential fallback can never reuse the first principal's grant.
    async executeMutation<T>(
      user: ProjectUser,
      repository: { owner: string; repo: string; branch: string },
      kind: 'single' | 'multi',
      operation: () => Promise<T>,
    ): Promise<T> {
      const { owner, repo } = repository
      const key = mutationKey(user, owner, repo)
      if (activeMutations.has(key))
        throw new Error('Repository mutation is already running')
      activeMutations.add(key)
      try {
        let writes = 0
        const pin = (admission: RepositoryAccess) => {
          const count =
            <TArgs extends unknown[], TResult>(
              write: (...args: TArgs) => Promise<TResult>,
            ) =>
            async (...args: TArgs) => {
              const result = await write(...args)
              writes++
              return result
            }
          mutations.set(key, {
            ...admission,
            api: {
              ...admission.api,
              putFile: count(admission.api.putFile),
              deleteFile: count(admission.api.deleteFile),
              renameFile: count(admission.api.renameFile),
            },
          })
        }
        const admission = await directAdmission(user, owner, repo, kind)
        const rememberFallback = () => {
          if (admission.choiceKey)
            rememberCredential(admission.choiceKey, 'installation')
        }
        pin(admission)
        try {
          return await operation()
        } catch (error) {
          const denied =
            error instanceof GitHubApiError &&
            !error.retryAfter &&
            (error.status === 401 ||
              error.status === 404 ||
              (error.status === 403 &&
                /resource not accessible|permission denied|not authorized|requires .*permission|must have .*access/i.test(
                  error.message,
                )))
          if (
            admission.tokenSource !== 'user' ||
            kind !== 'single' ||
            writes > 0 ||
            !denied
          )
            throw error
          // A missing file is not proof that this token lost repository access.
          if (error.status === 404) {
            try {
              await admission.api.getRepository(owner, repo)
            } catch (probeError) {
              if (
                !(probeError instanceof GitHubApiError) ||
                probeError.retryAfter ||
                ![401, 403, 404].includes(probeError.status)
              )
                throw probeError
              const fallback = await resolveInstallation(user, owner, repo)
              rememberFallback()
              pin(fallback)
              return await operation()
            }
            throw error
          }
          const fallback = await resolveInstallation(user, owner, repo)
          rememberFallback()
          pin(fallback)
          return await operation()
        }
      } finally {
        mutations.delete(key)
        activeMutations.delete(key)
      }
    },
    async forInstallation(installationId: number) {
      return githubApiFactory(await getInstallationToken(installationId))
    },
    resolve(user: ProjectUser, owner: string, repo: string, branch?: string) {
      const mutation = mutations.get(mutationKey(user, owner, repo))
      if (mutation) return Promise.resolve(mutation)
      const key = [
        user.id,
        user.email.toLowerCase(),
        String(user.emailVerified === true),
        owner.toLowerCase(),
        repo.toLowerCase(),
        branch ?? '',
      ].join('\0')
      let resolution = resolutions.get(key)
      if (!resolution) {
        const unscoped = branch
          ? resolutions.get(
              [
                user.id,
                user.email.toLowerCase(),
                String(user.emailVerified === true),
                owner.toLowerCase(),
                repo.toLowerCase(),
                '',
              ].join('\0'),
            )
          : undefined
        resolution = unscoped ? unscoped : resolveUncached(user, owner, repo)
        resolutions.set(key, resolution)
        void resolution.catch(() => resolutions.delete(key))
      }
      return resolution
    },
  }
}

export type RepositoryAccessService = Pick<
  ReturnType<typeof createRepositoryAccessService>,
  'resolve'
>
