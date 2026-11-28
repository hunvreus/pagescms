import type * as RepositoryIdentityModule from '#/server/access/repository-identity'
import { describe, expect, it, vi } from 'vitest'
import { createRepositoryAccessService } from '../__tests__/credentials'
import { GitHubApiError } from '#/server/github/api'
import { createAccessPolicyGateway } from '#/server/access/policy'
import {
  requireRepositoryManager,
  resolveRepositoryPrincipal,
} from '#/server/access/repository-policy'
import { encryptSecret } from '#/server/auth/secret-crypto'
import type { AccessPrincipal } from '#/server/access/policy'
import type { Database } from '#/server/db/client'
import type { GitHubApi, GitHubApiFactory } from '#/server/github/api'

const user = {
  id: 'mutation-user',
  email: 'editor@example.com',
  emailVerified: true,
  githubUsername: 'editor',
}
const repository = { owner: 'owner', repo: 'repo', branch: 'main' }
const file = {
  ...repository,
  path: 'content/entry.md',
  content: 'eA==',
  message: 'Update',
  sha: 'original',
}

async function setup(token: string | null, member = true) {
  const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
  const encrypted = await encryptSecret('installation', cryptoKey)
  const membership = { current: member }
  const findMember = vi.fn(async () =>
    membership.current
      ? [{ email: user.email, installationId: 42, repoId: 10, ownerId: 20 }]
      : [],
  )
  const account = { accessToken: token }
  const database = {
    $client: {
      execute: vi.fn(async (statement: { sql: string }) => {
        if (statement.sql.includes('LEFT JOIN collaborator c')) {
          const members = await findMember()
          return {
            rows: (members.length ? members : [null]).map((row) => ({
              identityId: 1,
              externalId: '10',
              identityOwnerId: '20',
              identityOwner: 'owner',
              identityRepo: 'repo',
              id: row ? 1 : null,
              installationId: null,
              email: null,
              userId: row ? user.id : null,
              repoId: null,
              ownerId: null,
              ...row,
            })),
          }
        }
        return {
          rows: statement.sql.includes('FROM collaborator')
            ? await findMember()
            : [{ ...encrypted, expiresAt: Date.now() + 600000 }],
        }
      }),
    },
    query: {
      accountTable: { findFirst: vi.fn(async () => account) },
      collaboratorTable: { findMany: findMember },
    },
  } as unknown as Database
  const api = () => ({
    getRepository: vi.fn(async () => ({
      id: 10,
      ownerId: 20,
      owner: 'owner',
      repo: 'repo',
      defaultBranch: 'main',
      private: false,
      canPush: true,
    })),
    putFile: vi.fn(async () => ({
      path: file.path,
      sha: 'saved',
      commitSha: 'commit',
    })),
    deleteFile: vi.fn(async () => ({ commitSha: 'deleted' })),
    renameFile: vi.fn(async () => ({
      path: 'renamed.md',
      sha: 'saved',
      commitSha: 'renamed',
    })),
  })
  const direct = api(),
    installation = api()
  const factory: GitHubApiFactory = (value) =>
    (value === 'installation' ? installation : direct) as unknown as GitHubApi
  const service = () =>
    createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: { appId: '123', privateKey: 'cached-token-only', cryptoKey },
      githubApiFactory: factory,
    })
  return { service, direct, installation, membership, findMember, account }
}

async function write(
  service: ReturnType<typeof createRepositoryAccessService>,
  authorize: (principal: AccessPrincipal) => Promise<void> = vi.fn(
    async (_principal: AccessPrincipal) => {},
  ),
  kind: 'single' | 'multi' = 'single',
) {
  return service.executeMutation(user, repository, kind, async () => {
    const principal = await resolveRepositoryPrincipal(
      service,
      user,
      repository,
    )
    await authorize(principal)
    const { api } = await service.resolve(
      user,
      repository.owner,
      repository.repo,
      repository.branch,
    )
    return api.putFile(file)
  })
}

describe('repository mutation credentials', () => {
  it.each(['single', 'multi'] as const)(
    'rejects a read-only GitHub user before a %s external side effect',
    async (kind) => {
      const fixture = await setup(`read-only-${kind}`, false)
      const metadata = await fixture.direct.getRepository()
      fixture.direct.getRepository.mockResolvedValue({
        ...metadata,
        canPush: false,
      })
      const operation = vi.fn(async () => 'external-write')
      await expect(
        fixture.service().executeMutation(user, repository, kind, operation),
      ).rejects.toThrow('do not have permission')
      expect(operation).not.toHaveBeenCalled()
    },
  )

  it('admits a read-only GitHub user only as their restricted collaborator membership', async () => {
    const fixture = await setup('read-only-member')
    const metadata = await fixture.direct.getRepository()
    fixture.direct.getRepository.mockResolvedValue({
      ...metadata,
      canPush: false,
    })
    const authorize = vi.fn(async (_principal: AccessPrincipal) => {})
    await write(fixture.service(), authorize, 'multi')
    expect(authorize.mock.calls[0]?.[0].type).toBe('collaborator')
    expect(fixture.direct.putFile).not.toHaveBeenCalled()
    expect(fixture.installation.putFile).toHaveBeenCalledOnce()
  })

  it('checks write permission before each create, update and delete', async () => {
    const fixture = await setup('fast-user')
    for (const sha of [undefined, 'existing']) {
      const service = fixture.service()
      await service.executeMutation(user, repository, 'single', async () => {
        const { api } = await service.resolve(
          user,
          repository.owner,
          repository.repo,
          repository.branch,
        )
        await api.putFile({ ...file, sha })
      })
    }
    const service = fixture.service()
    await service.executeMutation(user, repository, 'single', async () => {
      const { api } = await service.resolve(
        user,
        repository.owner,
        repository.repo,
        repository.branch,
      )
      await api.deleteFile({ ...file, sha: 'existing' })
    })
    expect(fixture.direct.getRepository).toHaveBeenCalledTimes(3)
    expect(fixture.direct.putFile).toHaveBeenCalledTimes(2)
    expect(fixture.direct.deleteFile).toHaveBeenCalledTimes(1)
  })

  it('rechecks write permission after two minutes in the editor', async () => {
    const fixture = await setup('idle-editor')
    await fixture
      .service()
      .resolve(user, repository.owner, repository.repo, repository.branch)
    fixture.direct.getRepository.mockClear()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000)
    try {
      await write(fixture.service())
      expect(fixture.direct.getRepository).toHaveBeenCalledOnce()
    } finally {
      clock.mockRestore()
    }
  })

  it('reserves mutation scope before resolving credentials and releases failed admission', async () => {
    const fixture = await setup('concurrent-user')
    const service = fixture.service()
    const first = write(service)
    await expect(write(service)).rejects.toThrow('already running')
    await first
    expect(fixture.direct.putFile).toHaveBeenCalledTimes(1)
    const removed = await setup(null, false)
    const restricted = removed.service()
    await expect(write(restricted)).rejects.toThrow('do not have permission')
    removed.membership.current = true
    await write(restricted)
    expect(removed.installation.putFile).toHaveBeenCalledTimes(1)
  })

  it('checks current membership on every app-token mutation and rejects removal despite a cached token', async () => {
    const fixture = await setup(null)
    await write(fixture.service())
    fixture.membership.current = false
    await expect(write(fixture.service())).rejects.toThrow(
      'do not have permission',
    )
    expect(fixture.findMember).toHaveBeenCalledTimes(2)
    expect(fixture.installation.putFile).toHaveBeenCalledTimes(1)
  })

  it('remembers the editor credential choice but never remembers collaborator permission', async () => {
    const fixture = await setup('editor-fallback')
    fixture.direct.getRepository.mockRejectedValue(
      new GitHubApiError('Not Found', 404),
    )
    await fixture
      .service()
      .resolve(user, repository.owner, repository.repo, repository.branch)
    fixture.direct.getRepository.mockClear()
    await write(fixture.service())
    expect(fixture.direct.putFile).not.toHaveBeenCalled()
    expect(fixture.direct.getRepository).not.toHaveBeenCalled()
    fixture.membership.current = false
    await expect(write(fixture.service())).rejects.toThrow(
      'do not have permission',
    )
    expect(fixture.installation.putFile).toHaveBeenCalledTimes(1)
  })

  it('fails rejected user credentials without retrying another principal', async () => {
    const fixture = await setup('rejected-user')
    fixture.direct.putFile.mockRejectedValue(
      new GitHubApiError('Bad credentials', 401),
    )
    const seen: string[] = []
    const gateway = createAccessPolicyGateway({
      required: true,
      policy: {
        authorize: async (request) => {
          seen.push(request.principal.type)
          return request.principal.type === 'collaborator'
            ? { allowed: false, reason: 'permission_denied' }
            : { allowed: true }
        },
      },
    })
    await expect(
      write(fixture.service(), async (principal) => {
        await gateway.authorize({
          operation: 'entry.update',
          principal,
          tenant: { type: 'repository', id: 'owner/repo' },
          target: { repository, branch: repository.branch, path: file.path },
        })
      }),
    ).rejects.toThrow('Bad credentials')
    expect(seen).toEqual(['user'])
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
  })

  it('does not retry failed writes with another credential', async () => {
    const fixture = await setup('no-fallback')
    fixture.direct.putFile.mockRejectedValue(
      new GitHubApiError('Bad credentials', 401),
    )
    const authorize = vi.fn(async (_principal: AccessPrincipal) => {})
    await expect(write(fixture.service(), authorize)).rejects.toThrow(
      'Bad credentials',
    )
    expect(authorize.mock.calls.map((call) => call[0])).toMatchObject([
      { type: 'user' },
    ])
    expect(fixture.direct.putFile).toHaveBeenCalledOnce()
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
  })

  it.each([
    [403, 'API rate limit exceeded', '123'],
    [403, 'You have exceeded a secondary rate limit', undefined],
    [403, 'Forbidden', undefined],
    [409, 'Conflict', undefined],
    [422, 'Validation failed', undefined],
    [500, 'Server error', undefined],
  ])(
    'does not switch credentials for %s / %s',
    async (status, message, retryAfter) => {
      const fixture = await setup(`no-retry-${status}-${message}`)
      fixture.direct.putFile.mockRejectedValue(
        new GitHubApiError(message, status, retryAfter),
      )
      await expect(write(fixture.service())).rejects.toThrow(message)
      expect(fixture.installation.putFile).not.toHaveBeenCalled()
      expect(fixture.findMember).not.toHaveBeenCalled()
    },
  )

  it('does not switch credentials on a missing file when the user still has repository access', async () => {
    const fixture = await setup('missing-file')
    fixture.direct.putFile.mockRejectedValue(
      new GitHubApiError('Not Found', 404),
    )
    await expect(write(fixture.service())).rejects.toThrow('Not Found')
    expect(fixture.direct.getRepository).toHaveBeenCalledOnce()
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
  })

  it('requires current membership before falling back on a private-repository 404', async () => {
    const fixture = await setup('private-404', false)
    fixture.direct.putFile.mockRejectedValue(
      new GitHubApiError('Not Found', 404),
    )
    fixture.direct.getRepository.mockRejectedValue(
      new GitHubApiError('Not Found', 404),
    )
    await expect(write(fixture.service())).rejects.toThrow(
      'do not have permission',
    )
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
  })

  it('selects credentials before a cold multi-write operation instead of retrying it', async () => {
    const fixture = await setup('cold-multi')
    fixture.direct.getRepository.mockRejectedValue(
      new GitHubApiError('Bad credentials', 401),
    )
    const service = fixture.service()
    const authorize = vi.fn(async (_principal: AccessPrincipal) => {})
    await service.executeMutation(user, repository, 'multi', async () => {
      await authorize(
        await resolveRepositoryPrincipal(service, user, repository),
      )
      const { api } = await service.resolve(
        user,
        repository.owner,
        repository.repo,
      )
      return api.renameFile({ ...file, newPath: 'new.md', sha: 'existing' })
    })
    expect(authorize.mock.calls[0]?.[0].type).toBe('collaborator')
    expect(fixture.direct.renameFile).not.toHaveBeenCalled()
    expect(fixture.installation.renameFile).toHaveBeenCalledTimes(1)
  })

  it('does not retry an ambiguous network failure', async () => {
    const fixture = await setup('network-failure')
    fixture.direct.putFile.mockRejectedValue(new Error('Connection timed out'))
    await expect(write(fixture.service())).rejects.toThrow(
      'Connection timed out',
    )
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
    expect(fixture.findMember).not.toHaveBeenCalled()
  })

  it('does not replay a multi-write rename or a partly completed operation', async () => {
    const fixture = await setup('multi-write')
    fixture.direct.renameFile.mockRejectedValue(
      new GitHubApiError('Bad credentials', 401),
    )
    const service = fixture.service()
    await expect(
      service.executeMutation(user, repository, 'multi', async () => {
        const { api } = await service.resolve(
          user,
          repository.owner,
          repository.repo,
        )
        return api.renameFile({ ...file, newPath: 'new.md', sha: 'existing' })
      }),
    ).rejects.toThrow('Bad credentials')
    await expect(
      service.executeMutation(user, repository, 'single', async () => {
        const { api } = await service.resolve(
          user,
          repository.owner,
          repository.repo,
        )
        await api.putFile(file)
        throw new GitHubApiError('Bad credentials', 401)
      }),
    ).rejects.toThrow('Bad credentials')
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
    expect(fixture.installation.renameFile).not.toHaveBeenCalled()
  })

  it('still confines app credentials and still checks GitHub write permission for management', async () => {
    const fixture = await setup(null)
    const service = fixture.service()
    await expect(
      service.executeMutation(user, repository, 'single', async () => {
        const { api } = await service.resolve(
          user,
          repository.owner,
          repository.repo,
        )
        return api.putFile({ ...file, path: '.pages.yml' })
      }),
    ).rejects.toThrow('cannot change repository configuration')
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
    fixture.account.accessToken = 'manager-user'
    await requireRepositoryManager(fixture.service(), user, repository)
    expect(fixture.direct.getRepository).toHaveBeenCalled()
  })
})

vi.mock('#/server/access/repository-identity', async (original) => ({
  ...(await original<typeof RepositoryIdentityModule>()),
  findRepositoryIdentityById: async () => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    owner: 'owner',
    repo: 'repo',
  }),
  findRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  ensureRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  observeRepositoryIdentity: async () => ({ id: 1 }),
}))
