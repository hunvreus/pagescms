import { describe, expect, it, vi } from 'vitest'
import { createRepositoryAccessService } from './repository-access.server'
import { GitHubApiError } from './github-api.server'
import { createAccessPolicyGateway } from './access-policy.server'
import {
  requireRepositoryManager,
  resolveRepositoryPrincipal,
} from './repository-policy.server'
import { encryptSecret } from './secret-crypto.server'
import type { AccessPrincipal } from './access-policy.server'
import type { Database } from './database/client.server'
import type { GitHubApi, GitHubApiFactory } from './github-api.server'

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
    membership.current ? [{ email: user.email, installationId: 42 }] : [],
  )
  const account = { accessToken: token }
  const database = {
    query: {
      accountTable: { findFirst: vi.fn(async () => account) },
      collaboratorTable: { findMany: findMember },
      githubInstallationTokenTable: {
        findFirst: vi.fn(async () => ({
          ...encrypted,
          expiresAt: new Date(Date.now() + 600000),
        })),
      },
    },
  } as unknown as Database
  const api = () => ({
    getRepository: vi.fn(async () => ({ canPush: true })),
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
  it('creates, updates and deletes with the current user token without a repository probe', async () => {
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
    expect(fixture.direct.getRepository).not.toHaveBeenCalled()
    expect(fixture.direct.putFile).toHaveBeenCalledTimes(2)
    expect(fixture.direct.deleteFile).toHaveBeenCalledTimes(1)
  })

  it('does not need another repository read after two minutes in the editor', async () => {
    const fixture = await setup('idle-editor')
    await fixture
      .service()
      .resolve(user, repository.owner, repository.repo, repository.branch)
    fixture.direct.getRepository.mockClear()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000)
    try {
      await write(fixture.service())
      expect(fixture.direct.getRepository).not.toHaveBeenCalled()
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

  it('reauthorizes with collaborator restrictions before retrying rejected user credentials', async () => {
    const fixture = await setup('rejected-user')
    fixture.direct.putFile.mockRejectedValue(
      new GitHubApiError('Bad credentials', 401),
    )
    const seen: string[] = []
    const gateway = createAccessPolicyGateway({
      deployment: 'hosted',
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
    ).rejects.toThrow('permission_denied')
    expect(seen).toEqual(['user', 'collaborator'])
    expect(fixture.installation.putFile).not.toHaveBeenCalled()
  })

  it('allows one authorized fallback and uses it on the next request', async () => {
    const fixture = await setup('successful-fallback')
    fixture.direct.putFile.mockRejectedValue(
      new GitHubApiError('Bad credentials', 401),
    )
    const authorize = vi.fn(async (_principal: AccessPrincipal) => {})
    await write(fixture.service(), authorize)
    expect(authorize.mock.calls.map((call) => call[0])).toMatchObject([
      { type: 'user' },
      { type: 'collaborator' },
    ])
    await write(fixture.service())
    expect(fixture.direct.putFile).toHaveBeenCalledTimes(1)
    expect(fixture.installation.putFile).toHaveBeenCalledTimes(2)
    fixture.account.accessToken = 'rotated-user'
    fixture.direct.putFile.mockResolvedValue({
      path: file.path,
      sha: 'saved',
      commitSha: 'commit',
    })
    await write(fixture.service())
    expect(fixture.direct.putFile).toHaveBeenCalledTimes(2)
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
    expect(fixture.direct.getRepository).toHaveBeenCalledTimes(1)
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
