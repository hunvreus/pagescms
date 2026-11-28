import { AccessDeniedError } from '#/server/access/policy'
import { repositoryRows } from '../repository-fixture'
import { count, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatabase } from '#/server/db/client'
import {
  cacheFileMetaTable,
  cacheFileTable,
  collaboratorInviteTable,
  configTable,
  repositoryTable,
} from '#/server/db/schema'
import { saveConfigurationSource } from '#/server/services/configuration-editor'
import { loadCollection } from '#/server/content/collection'
import { recordRepositoryOpened } from '#/server/repository/activity'
import { createRepositoryService } from '#/server/__tests__/credentials'
import {
  loadCacheStatus,
  manageCache,
} from '#/server/services/cache-management'
import { validateConfigurationSource } from '#/shared/configuration-source'
import { createConfigurationStore } from '#/server/cache/configuration'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import { cachePolicy, configureCachePolicy } from '#/server/cache/policy'
import {
  createDirectoryCache,
  invalidateDirectoryCache,
  staleDirectoryCache,
} from '#/server/cache/directory'
import {
  applyRepositoryPush,
  updateRepositoryCacheAfterMutation,
} from '#/server/cache/repository'
import { handleGitHubWebhook } from '#/server/github/webhook'
import { RepositoryProviderError } from '#/server/repository/provider'

import type { GitHubApi } from '#/server/github/api'
import type { RepositoryAccessService } from '#/server/access/repository'

const databaseUrl = process.env.TEST_DATABASE_URL
const integration = databaseUrl ? describe : describe.skip
const database = databaseUrl ? createDatabase({ url: databaseUrl }) : null

integration('SQLite integration', () => {
  it('opens a selected branch without loading every branch and records recent activity', async () => {
    const owner = 'performance',
      repo = 'workspace',
      branch = 'feature/a'
    await createConfigurationStore({ database: database! }).save(
      owner,
      repo,
      branch,
      'config',
      { content: [] },
    )
    const api = {
      getRepository: vi.fn().mockResolvedValue({
        id: 999,
        ownerId: 1000,
        owner,
        repo,
        defaultBranch: 'main',
      }),
      branchExists: vi.fn().mockResolvedValue(true),
      listBranches: vi.fn(),
    } as unknown as GitHubApi
    const access = {
      resolve: vi.fn().mockResolvedValue({ api, tokenSource: 'user' }),
    } as unknown as RepositoryAccessService
    const service = createRepositoryService(database!, database!, access)
    const workspace = await service.openRepository(
      { id: 'user', email: 'user@example.com', githubUsername: 'user' },
      owner,
      repo,
      branch,
    )
    expect(workspace).toMatchObject({
      branchExists: true,
      branches: ['main', 'feature/a'],
    })
    expect(api.branchExists).toHaveBeenCalledWith(owner, repo, branch)
    expect(api.listBranches).not.toHaveBeenCalled()
    const before = await database!.query.repositoryTable.findFirst({
      where: eq(repositoryTable.owner, owner),
    })
    await recordRepositoryOpened(database!, owner, repo)
    const after = await database!.query.repositoryTable.findFirst({
      where: eq(repositoryTable.owner, owner),
    })
    expect(after?.lastOpenedAt).toEqual(before?.lastOpenedAt)
  })

  it('projects collection payloads while retaining complete cached source', async () => {
    const owner = 'performance',
      repo = 'collection',
      branch = 'main'
    await createConfigurationStore({ database: database! }).save(
      owner,
      repo,
      branch,
      'config',
      {
        content: [
          {
            name: 'posts',
            type: 'collection',
            path: 'posts',
            format: 'yaml-frontmatter',
            fields: [
              { name: 'title', type: 'string' },
              { name: 'body', type: 'rich-text' },
            ],
            view: { fields: ['title'] },
          },
        ],
      },
    )
    const source = `---\ntitle: Post\n---\n${'large body'.repeat(1000)}`
    const api = {
      getRefSha: vi.fn().mockResolvedValue('head'),
      getDirectory: vi.fn().mockResolvedValue([
        {
          type: 'file',
          name: 'post.md',
          path: 'posts/post.md',
          sha: 'post-sha',
          content: source,
          size: source.length,
        },
      ]),
    } as unknown as GitHubApi
    const collection = await loadCollection({
      database: database!,
      repositoryAccess: {
        resolve: vi.fn().mockResolvedValue({ api, tokenSource: 'user' }),
      },
      user: { id: 'user', email: 'user@example.com', githubUsername: 'user' },
      owner,
      repo,
      branch,
      name: 'posts',
    })
    expect(collection.contents[0]).toMatchObject({ fields: { title: 'Post' } })
    expect(JSON.stringify(collection.contents)).not.toContain('large body')
    expect(
      (await database!.select().from(cacheFileTable)).some(
        (file) => file.content === source,
      ),
    ).toBe(true)
  })
  beforeEach(async () => {
    await database!.delete(cacheFileTable)
    await database!.delete(cacheFileMetaTable)
    await database!.delete(collaboratorInviteTable)
    await database!.delete(configTable)
  })

  it.each([undefined, false, true])(
    'caches collection reads independently of the cache management setting: %s',
    async (setting) => {
      const owner = 'always-cached'
      const repo = 'content'
      const branch = 'main'
      await createConfigurationStore({ database: database! }).save(
        owner,
        repo,
        branch,
        'config-sha',
        {
          settings: setting === undefined ? {} : { cache: setting },
          content: [{ name: 'posts', type: 'collection', path: 'posts' }],
        },
      )
      const api = {
        getRefSha: vi.fn().mockResolvedValue('head'),
        getDirectory: vi.fn().mockResolvedValue([]),
      } as unknown as GitHubApi
      const input = {
        database: database!,
        repositoryAccess: {
          resolve: vi.fn().mockResolvedValue({ api, tokenSource: 'user' }),
        } as unknown as RepositoryAccessService,
        user: {
          id: 'cache-user',
          email: 'cache@example.com',
          githubUsername: 'cache-user',
        },
        owner,
        repo,
        branch,
        name: 'posts',
      }
      await loadCollection(input)
      await loadCollection(input)
      expect(api.getDirectory).toHaveBeenCalledTimes(1)
      expect(await database!.select().from(cacheFileMetaTable)).toHaveLength(1)
    },
  )

  it('reports malformed cached entries on each collection load', async () => {
    const owner = 'parse-check',
      repo = 'entries',
      branch = 'main'
    await createConfigurationStore({ database: database! }).save(
      owner,
      repo,
      branch,
      'config',
      {
        content: [
          {
            name: 'posts',
            type: 'collection',
            path: 'posts',
            format: 'json',
            fields: [{ name: 'title', type: 'string' }],
          },
        ],
      },
    )
    const api = {
      getRefSha: vi.fn().mockResolvedValue('head'),
      getDirectory: vi.fn().mockResolvedValue([
        {
          type: 'file',
          name: 'good.json',
          path: 'posts/good.json',
          sha: 'good',
          content: '{"title":"Good"}',
          size: 16,
        },
        {
          type: 'file',
          name: 'bad.json',
          path: 'posts/bad.json',
          sha: 'bad',
          content: '{',
          size: 1,
        },
      ]),
    } as unknown as GitHubApi
    const input = {
      database: database!,
      repositoryAccess: {
        resolve: vi.fn().mockResolvedValue({ api, tokenSource: 'user' }),
      },
      user: { id: 'user', email: 'user@example.com', githubUsername: 'user' },
      owner,
      repo,
      branch,
      name: 'posts',
    }
    for (let i = 0; i < 2; i++) {
      const result = await loadCollection(input)
      expect(
        result.contents.find((entry) => entry.path === 'posts/good.json'),
      ).toMatchObject({ fields: { title: 'Good' } })
      expect(
        result.errors.some((error) => error.includes('posts/bad.json')),
      ).toBe(true)
    }
    expect(
      (await database!.select().from(cacheFileTable)).find(
        (file) => file.path === 'posts/bad.json',
      )?.content,
    ).toBe('{')
  })

  it('requires enabled cache management and preserves write-access checks', async () => {
    await observeRepositoryIdentity(database!, {
      id: 87654321,
      ownerId: 20,
      owner: 'empty-cache',
      repo: 'empty',
    })
    const api = {
      getRepository: vi.fn().mockResolvedValue({
        id: 87654321,
        ownerId: 20,
        owner: 'empty-cache',
        repo: 'empty',
        canPush: true,
      }),
      getFile: vi.fn().mockResolvedValue({
        sha: 'disabled-config',
        content: btoa('settings:\n  cache: false\n'),
      }),
    } as unknown as GitHubApi
    const resolve = vi.fn().mockResolvedValue({ api, tokenSource: 'user' })
    const input = {
      database: database!,
      repositoryAccess: { resolve } as unknown as RepositoryAccessService,
      user: {
        id: 'cache-user',
        email: 'cache@example.com',
        githubUsername: 'cache-user',
      },
      owner: 'empty-cache',
      repo: 'empty',
      branch: 'main',
    }
    await expect(loadCacheStatus(input)).rejects.toThrow(
      'Cache management is disabled',
    )
    vi.mocked(api.getFile).mockResolvedValue({
      sha: 'enabled-config',
      content: btoa('settings:\n  cache: true\n'),
    })
    await expect(loadCacheStatus(input)).rejects.toThrow(
      'Cache management is disabled',
    )
    await createConfigurationStore({ database: database! }).refresh(
      api,
      input.owner,
      input.repo,
      input.branch,
    )
    await expect(loadCacheStatus(input)).resolves.toMatchObject({
      fileCount: 0,
      directoryCount: 0,
      configuration: { sha: 'enabled-config' },
    })
    await expect(
      manageCache({ ...input, action: 'clear-all' }),
    ).resolves.toEqual({ message: 'All repository caches cleared' })
    vi.mocked(api.getRepository).mockResolvedValue({
      canPush: false,
    } as Awaited<ReturnType<GitHubApi['getRepository']>>)
    await expect(loadCacheStatus(input)).rejects.toThrow(
      'Repository write access is required',
    )
    resolve.mockResolvedValue({ api, tokenSource: 'installation' })
    await expect(
      manageCache({ ...input, action: 'clear-all' }),
    ).rejects.toThrow(AccessDeniedError)
  })

  it('creates the core tables from the baseline', async () => {
    const result = await database!.all<{ name: string }>(sql`
      select name from sqlite_master where type = 'table'
    `)
    expect(result.map((row: { name: string }) => row.name)).toEqual(
      expect.arrayContaining([
        'user',
        'session',
        'account',
        'verification',
        'github_installation_token',
        'collaborator',
        'collaborator_invite',
        'config',
        'cache_file',
        'cache_file_meta',
        'action_run',
      ]),
    )
  })

  it('enforces case-insensitive invitation uniqueness', async () => {
    const invitation = {
      repoId: 10,
      token: 'first-token',
      email: 'Editor@Example.com',
      owner: 'PagesCMS',
      repo: 'Website',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    }
    await database!.insert(collaboratorInviteTable).values(invitation)
    await expect(
      database!.insert(collaboratorInviteTable).values({
        ...invitation,
        token: 'second-token',
        email: invitation.email.toLowerCase(),
        owner: invitation.owner.toLowerCase(),
        repo: invitation.repo.toLowerCase(),
      }),
    ).rejects.toThrow()
  })

  it('persists, reuses, and invalidates directory snapshots', async () => {
    const getDirectory = vi.fn().mockResolvedValue([
      {
        type: 'file' as const,
        name: 'hello.md',
        path: 'content/hello.md',
        sha: 'file-sha',
        content: 'title: Hello',
        size: 12,
      },
    ])
    const cache = createDirectoryCache({
      database: database!,
      clock: { now: () => new Date('2026-08-20T00:00:00Z') },
    })
    const input = {
      api: {
        getDirectory,
        getRefSha: vi.fn().mockResolvedValue('revision-one'),
      } as unknown as GitHubApi,
      owner: 'PagesCMS',
      repo: 'Website',
      branch: 'main',
      path: 'content',
      context: 'collection' as const,
      enabled: true,
    }

    await expect(cache.get(input)).resolves.toMatchObject({
      entries: [{ path: 'content/hello.md', sha: 'file-sha' }],
    })
    await expect(cache.get(input)).resolves.toMatchObject({
      entries: [{ path: 'content/hello.md', sha: 'file-sha' }],
    })
    expect(getDirectory).toHaveBeenCalledTimes(1)
    await expect(
      database!
        .select({ total: count() })
        .from(cacheFileTable)
        .where(eq(cacheFileTable.owner, 'pagescms')),
    ).resolves.toEqual([{ total: 1 }])

    await invalidateDirectoryCache(database!, 'PagesCMS', 'Website', 'main')
    await expect(
      database!.select({ total: count() }).from(cacheFileTable),
    ).resolves.toEqual([{ total: 0 }])
  })

  it('isolates durable directory snapshots by repository source', async () => {
    const cache = createDirectoryCache({ database: database! })
    const input = (source: string, title: string) => ({
      api: {
        source,
        getRefSha: vi.fn().mockResolvedValue(`${source}-revision`),
        getDirectory: vi.fn().mockResolvedValue([
          {
            type: 'file' as const,
            name: 'entry.md',
            path: 'content/entry.md',
            sha: `${source}-sha`,
            content: title,
            size: title.length,
            downloadUrl: null,
          },
        ]),
      } as unknown as GitHubApi,
      owner: 'same-owner',
      repo: 'same-repo',
      branch: 'main',
      path: 'content',
      context: 'collection' as const,
      enabled: true,
    })

    await expect(
      cache.get(input('github.com', 'GitHub')),
    ).resolves.toMatchObject({ entries: [{ content: 'GitHub' }] })
    await expect(
      cache.get(input('gitlab.example.com', 'GitLab')),
    ).resolves.toMatchObject({ entries: [{ content: 'GitLab' }] })

    const rows = await database!.select().from(cacheFileTable)
    expect(rows.map(({ source, content }) => ({ source, content }))).toEqual([
      { source: 'github.com', content: 'GitHub' },
      { source: 'gitlab.example.com', content: 'GitLab' },
    ])
  })

  const scope = {
    owner: 'pagescms',
    repo: 'website',
    branch: 'main',
    path: 'posts',
    context: 'collection',
  }
  const entry = (path: string, sha = 'blob-one') => ({
    path,
    name: path.split('/').at(-1)!,
    type: 'file' as const,
    sha,
    content: 'title: Hello',
    size: 12,
    downloadUrl: null,
  })
  async function seed(
    path = 'posts',
    revision = 'before',
    paths = [`${path}/first.md`, `${path}/second.md`],
  ) {
    await database!.insert(cacheFileMetaTable).values(
      await repositoryRows(database!, {
        ...scope,
        path,
        commitSha: revision,
        status: 'ok',
      }),
    )
    await database!.insert(cacheFileTable).values(
      await repositoryRows(
        database!,
        paths.map((filePath) => ({
          ...scope,
          ...entry(filePath),
          parentPath: filePath.slice(0, filePath.lastIndexOf('/')),
          commitSha: revision,
          updatedAt: new Date('2026-01-01'),
        })),
      ),
    )
  }

  it('stores media listings separately without persisting content or delivery URLs', async () => {
    await seed()
    const api = {
      getMediaDirectory: vi.fn().mockResolvedValue([
        {
          ...entry('posts/image.png'),
          downloadUrl: 'https://example.test/private',
        },
      ]),
      getRefSha: vi.fn().mockResolvedValue('media-revision'),
    } as unknown as GitHubApi
    const result = await createDirectoryCache({ database: database! }).get({
      ...scope,
      context: 'media',
      enabled: true,
      api,
    })
    expect(result.entries.map((file) => file.path)).toEqual(['posts/image.png'])
    const rows = await database!.select().from(cacheFileTable)
    const media = rows.find((row) => row.context === 'media')
    expect(media).toMatchObject({ path: 'posts/image.png', content: null })
    expect(JSON.stringify(media)).not.toContain('https://example.test/private')
    expect(
      (await database!.select().from(cacheFileMetaTable)).some(
        (row) => row.context === 'media',
      ),
    ).toBe(true)
  })

  it.each([
    'content: []\nsettings:\n  config: true\n',
    'content: []\nsurprise: true\nsettings:\n  config: true\n  ignored: true\n',
    'content: []\nmedia:\n  input: images\n  output: /images\n  ignored: true\n',
  ])('stores configuration including warning-only YAML: %s', async (source) => {
    const api = {
      getRepository: vi.fn().mockResolvedValue({
        id: 87654322,
        ownerId: 7,
        owner: scope.owner,
        repo: scope.repo,
        canPush: true,
      }),
      getFile: vi
        .fn()
        .mockResolvedValue({ sha: 'old', content: btoa('content: []') }),
      putFile: vi.fn().mockResolvedValue({
        sha: 'new',
        commitSha: 'after',
        path: '.pages.yml',
      }),
    } as unknown as GitHubApi
    await saveConfigurationSource({
      database: database!,
      repositoryAccess: {
        resolve: async () => ({ api, tokenSource: 'user' as const }),
      },
      user: {
        id: 'u',
        email: 'user@example.com',
        name: 'User',
        githubUsername: 'user',
      },
      owner: scope.owner,
      repo: scope.repo,
      branch: scope.branch,
      source,
      sha: 'old',
    })
    const calls = vi.mocked(api.getFile).mock.calls.length
    const configuration = await createConfigurationStore({
      database: database!,
    }).get(api, scope.owner, scope.repo, scope.branch)
    expect(configuration?.sha).toBe('new')
    expect(api.getFile).toHaveBeenCalledTimes(calls)
    expect(api.putFile).toHaveBeenCalledWith(
      expect.objectContaining({ content: btoa(source) }),
    )
  })

  it.each([
    'media: *missing\n',
    'content: [\n',
    'content: false\n',
    'media:\n  input: 123\n  output: images\n',
  ])(
    'rejects invalid configuration before accessing or writing the repository: %s',
    async (source) => {
      const resolve = vi.fn()
      const diagnostic = validateConfigurationSource(source).diagnostics.find(
        ({ severity }) => severity === 'error',
      )
      await expect(
        saveConfigurationSource({
          database: database!,
          repositoryAccess: { resolve },
          user: {
            id: 'u',
            email: 'user@example.com',
            name: 'User',
            githubUsername: 'user',
          },
          owner: scope.owner,
          repo: scope.repo,
          branch: scope.branch,
          source,
          sha: 'old',
        }),
      ).rejects.toThrow(diagnostic!.message)
      expect(resolve).not.toHaveBeenCalled()
    },
  )

  it('isolates parsed configuration by repository source', async () => {
    const store = createConfigurationStore({ database: database! })
    await store.save('owner', 'repo', 'main', 'github-sha', { content: [] })
    await store.save(
      'owner',
      'repo',
      'main',
      'local-sha',
      { content: [] },
      'local:/workspace/repo',
    )

    const rows = await database!.select().from(configTable)
    expect(rows.map(({ source, sha }) => ({ source, sha }))).toEqual([
      { source: 'github.com', sha: 'github-sha' },
      { source: 'local:/workspace/repo', sha: 'local-sha' },
    ])
  })

  it('does not let an older configuration fetch overwrite a completed save', async () => {
    const store = createConfigurationStore({ database: database! })
    await store.save(scope.owner, scope.repo, scope.branch, 'before', {
      content: [],
    })
    let resolveFile!: (file: { sha: string; content: string }) => void
    const getFile = vi.fn(
      () =>
        new Promise<{ sha: string; content: string }>((resolve) => {
          resolveFile = resolve
        }),
    )
    const api = { getFile } as unknown as GitHubApi
    const pending = store.refresh(api, scope.owner, scope.repo, scope.branch)
    await vi.waitFor(() => expect(getFile).toHaveBeenCalledTimes(1))
    await store.save(scope.owner, scope.repo, scope.branch, 'saved', {
      content: [],
    })
    resolveFile({ sha: 'older-fetch', content: btoa('content: []') })
    expect((await pending)?.sha).toBe('saved')
    expect((await database!.select().from(configTable))[0].sha).toBe('saved')
  })

  it('leaves cached entries untouched when configuration changes or disappears', async () => {
    await seed()
    const store = createConfigurationStore({ database: database! })
    await store.save(scope.owner, scope.repo, scope.branch, 'old', {
      content: [],
    })
    const files = await database!.select().from(cacheFileTable)
    const directories = await database!.select().from(cacheFileMetaTable)
    await store.save(scope.owner, scope.repo, scope.branch, 'new', {
      content: [],
    })
    const api = {
      getFile: vi
        .fn()
        .mockRejectedValue(new RepositoryProviderError('missing', 404)),
    } as unknown as GitHubApi
    await store.refresh(api, scope.owner, scope.repo, scope.branch)
    expect(await database!.select().from(cacheFileTable)).toEqual(files)
    expect(await database!.select().from(cacheFileMetaTable)).toEqual(
      directories,
    )
  })

  it('checks the branch after TTL expiry without downloading or rewriting unchanged files', async () => {
    await seed()
    const before = await database!.select().from(cacheFileTable)
    const api = {
      getRefSha: vi.fn().mockResolvedValue('before'),
      getDirectory: vi.fn(),
    } as unknown as GitHubApi
    const cache = createDirectoryCache({ database: database!, ttlMs: -1 })
    await cache.get({ ...scope, context: 'collection', api, enabled: true })
    expect(api.getDirectory).not.toHaveBeenCalled()
    expect(await database!.select().from(cacheFileTable)).toEqual(before)
  })

  it('applies legacy webhook thresholds without deleting existing files', async () => {
    await seed()
    await seed('other', 'before', ['other/a.md'])
    const before = await database!.select().from(cacheFileTable)
    const api = { getFiles: vi.fn() } as unknown as GitHubApi
    const resolve = vi.fn().mockResolvedValue(api)
    const push = (fileCount: number) => ({
      ref: 'refs/heads/main',
      before: 'before',
      after: 'after',
      installation: { id: 1 },
      repository: { name: scope.repo, owner: { login: scope.owner } },
      commits: [
        {
          added: [],
          removed: [],
          modified: Array.from(
            { length: fileCount },
            (_, i) => `posts/${i}.md`,
          ),
        },
      ],
    })
    await handleGitHubWebhook(database!, 'push', push(121), resolve)
    let metas = await database!.select().from(cacheFileMetaTable)
    expect(metas.find((row) => row.path === 'posts')?.status).toBe('stale')
    expect(metas.find((row) => row.path === 'other')?.status).toBe('ok')
    await handleGitHubWebhook(database!, 'push', push(801), resolve)
    metas = await database!.select().from(cacheFileMetaTable)
    expect(metas.every((row) => row.status === 'stale')).toBe(true)
    expect(await database!.select().from(cacheFileTable)).toEqual(before)
    expect(api.getFiles).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('preserves an already-applied snapshot during a large push without GitHub access', async () => {
    await seed('posts', 'after')
    await seed('other', 'before')
    const before = (await database!.select().from(cacheFileMetaTable))[0]
    const resolve = vi
      .fn()
      .mockRejectedValue(new Error('must not resolve credentials'))
    await handleGitHubWebhook(
      database!,
      'push',
      {
        ref: 'refs/heads/main',
        before: 'before',
        after: 'after',
        installation: { id: 1 },
        repository: { name: scope.repo, owner: { login: scope.owner } },
        commits: [
          {
            added: [],
            removed: [],
            modified: Array.from({ length: 801 }, (_, i) => `posts/${i}.md`),
          },
        ],
      },
      resolve,
    )
    const metas = await database!.select().from(cacheFileMetaTable)
    expect(metas.find((row) => row.path === 'posts')).toEqual(before)
    expect(metas.find((row) => row.path === 'other')?.status).toBe('stale')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('repopulates parsed configuration during a configuration push', async () => {
    const api = {
      getFile: vi.fn().mockResolvedValue({
        sha: 'configuration-sha',
        content: btoa('content: []'),
      }),
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi.fn(),
    } as unknown as GitHubApi
    await handleGitHubWebhook(
      database!,
      'push',
      {
        ref: 'refs/heads/main',
        before: 'before',
        after: 'after',
        installation: { id: 1 },
        repository: { name: scope.repo, owner: { login: scope.owner } },
        commits: [{ added: [], removed: [], modified: ['.pages.yml'] }],
      },
      async () => api,
    )
    const rows = await database!.select().from(configTable)
    expect(rows[0]?.sha).toBe('configuration-sha')
    expect(JSON.parse(rows[0].object).content).toEqual([])
    expect(api.getFile).toHaveBeenCalledTimes(1)
    expect(api.getRefSha).not.toHaveBeenCalled()
    expect(api.getFiles).not.toHaveBeenCalled()
  })

  it.each(['same', 'different', 'deleted', 'failure'] as const)(
    'handles a configuration push when the file is %s',
    async (caseName) => {
      await seed()
      const files = await database!.select().from(cacheFileTable)
      const store = createConfigurationStore({ database: database! })
      await store.save(scope.owner, scope.repo, scope.branch, 'old-sha', {
        content: [],
      })
      const getFile = vi.fn()
      if (caseName === 'same')
        getFile.mockResolvedValue({
          sha: 'old-sha',
          content: btoa('invalid: ['),
        })
      else if (caseName === 'different')
        getFile.mockResolvedValue({
          sha: 'new-sha',
          content: btoa('content: []'),
        })
      else
        getFile.mockRejectedValue(
          new RepositoryProviderError(
            'fetch failed',
            caseName === 'deleted' ? 404 : 503,
          ),
        )
      const api = {
        getFile,
        getRefSha: vi.fn().mockResolvedValue('after'),
        getFiles: vi.fn(),
      } as unknown as GitHubApi
      const run = handleGitHubWebhook(
        database!,
        'push',
        {
          ref: 'refs/heads/main',
          before: 'before',
          after: 'after',
          installation: { id: 1 },
          repository: { name: scope.repo, owner: { login: scope.owner } },
          commits: [{ added: [], removed: [], modified: ['.pages.yml'] }],
        },
        async () => api,
      )
      if (caseName === 'failure')
        await expect(run).rejects.toThrow('fetch failed')
      else await expect(run).resolves.toBeUndefined()
      const cached = await store.find(scope.owner, scope.repo, scope.branch)
      expect(cached?.sha ?? null).toBe(
        caseName === 'same'
          ? 'old-sha'
          : caseName === 'different'
            ? 'new-sha'
            : null,
      )
      expect(getFile).toHaveBeenCalledTimes(1)
      expect(await database!.select().from(cacheFileTable)).toEqual(files)
      expect(await database!.select().from(cacheFileMetaTable)).toEqual([
        expect.objectContaining(
          caseName === 'failure'
            ? { status: 'stale' }
            : { status: 'ok', commitSha: 'after' },
        ),
      ])
    },
  )

  it('keeps snapshots current across configuration and content pushes', async () => {
    await seed('posts', 'A')
    const initialFiles = await database!.select().from(cacheFileTable)
    const api = {
      getFile: vi
        .fn()
        .mockResolvedValue({ sha: 'config-B', content: btoa('content: []') }),
      getRefSha: vi
        .fn()
        .mockResolvedValueOnce('B')
        .mockResolvedValueOnce('B')
        .mockResolvedValue('C'),
      getFiles: vi
        .fn()
        .mockResolvedValue([
          { ...entry('posts/first.md', 'new-blob'), content: 'updated' },
        ]),
    } as unknown as GitHubApi
    const payload = (before: string, after: string, path: string) => ({
      ref: 'refs/heads/main',
      before,
      after,
      installation: { id: 1 },
      repository: { name: scope.repo, owner: { login: scope.owner } },
      commits: [{ added: [], removed: [], modified: [path] }],
    })
    await handleGitHubWebhook(
      database!,
      'push',
      payload('A', 'B', '.pages.yml'),
      async () => api,
    )
    expect(await database!.select().from(cacheFileMetaTable)).toEqual([
      expect.objectContaining({ status: 'ok', commitSha: 'B' }),
    ])
    await handleGitHubWebhook(
      database!,
      'push',
      payload('B', 'C', 'posts/first.md'),
      async () => api,
    )
    expect(await database!.select().from(cacheFileMetaTable)).toEqual([
      expect.objectContaining({ status: 'ok', commitSha: 'C' }),
    ])
    const files = await database!.select().from(cacheFileTable)
    expect(files.find((f) => f.path === 'posts/first.md')).toMatchObject({
      content: 'updated',
      sha: 'new-blob',
    })
    expect(files.find((f) => f.path === 'posts/second.md')?.content).toBe(
      initialFiles.find((f) => f.path === 'posts/second.md')?.content,
    )
    expect(api.getFiles).toHaveBeenCalledTimes(1)
  })

  it('refreshes a changed configuration even when push revisions are missing', async () => {
    const store = createConfigurationStore({ database: database! })
    await store.save(scope.owner, scope.repo, scope.branch, 'old-sha', {
      content: [],
    })
    const api = {
      getFile: vi
        .fn()
        .mockResolvedValue({ sha: 'new-sha', content: btoa('content: []') }),
      getRefSha: vi.fn(),
    } as unknown as GitHubApi
    await handleGitHubWebhook(
      database!,
      'push',
      {
        ref: 'refs/heads/main',
        installation: { id: 1 },
        repository: { name: scope.repo, owner: { login: scope.owner } },
        commits: [{ added: [], removed: [], modified: ['.pages.yml'] }],
      },
      async () => api,
    )
    expect((await store.find(scope.owner, scope.repo, scope.branch))?.sha).toBe(
      'new-sha',
    )
    expect(api.getFile).toHaveBeenCalledTimes(1)
    expect(api.getRefSha).not.toHaveBeenCalled()
  })

  it('keeps a configuration saved while its webhook fetch is pending', async () => {
    const store = createConfigurationStore({ database: database! })
    await store.save(scope.owner, scope.repo, scope.branch, 'old-sha', {
      content: [],
    })
    let finish!: (file: { sha: string; content: string }) => void
    const getFile = vi.fn(
      () =>
        new Promise<{ sha: string; content: string }>((resolve) => {
          finish = resolve
        }),
    )
    const api = {
      getFile,
      getRefSha: vi.fn(),
      getFiles: vi.fn(),
    } as unknown as GitHubApi
    const run = handleGitHubWebhook(
      database!,
      'push',
      {
        ref: 'refs/heads/main',
        before: 'before',
        after: 'after',
        installation: { id: 1 },
        repository: { name: scope.repo, owner: { login: scope.owner } },
        commits: [{ added: [], removed: [], modified: ['.pages.yml'] }],
      },
      async () => api,
    )
    await vi.waitFor(() => expect(getFile).toHaveBeenCalled())
    await store.save(scope.owner, scope.repo, scope.branch, 'newer-sha', {
      content: [],
    })
    finish({ sha: 'older-fetch', content: btoa('content: []') })
    await run
    expect((await store.find(scope.owner, scope.repo, scope.branch))?.sha).toBe(
      'newer-sha',
    )
  })

  it('still refreshes configuration for a large invalidation-only push', async () => {
    await seed()
    const api = {
      getFile: vi
        .fn()
        .mockResolvedValue({ sha: 'new-config', content: btoa('content: []') }),
      getRefSha: vi.fn(),
      getFiles: vi.fn(),
    } as unknown as GitHubApi
    const resolve = vi.fn().mockResolvedValue(api)
    await handleGitHubWebhook(
      database!,
      'push',
      {
        ref: 'refs/heads/main',
        before: 'before',
        after: 'after',
        installation: { id: 1 },
        repository: { name: scope.repo, owner: { login: scope.owner } },
        commits: [
          {
            added: [],
            removed: [],
            modified: [
              '.pages.yml',
              ...Array.from({ length: 121 }, (_, i) => `posts/${i}.md`),
            ],
          },
        ],
      },
      resolve,
    )
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(api.getFile).toHaveBeenCalledTimes(1)
    expect(api.getRefSha).not.toHaveBeenCalled()
    expect(api.getFiles).not.toHaveBeenCalled()
    expect((await database!.select().from(configTable))[0]?.sha).toBe(
      'new-config',
    )
    expect(await database!.select().from(cacheFileMetaTable)).toEqual([
      expect.objectContaining({ path: 'posts', status: 'stale' }),
    ])
    expect(await database!.select().from(cacheFileTable)).not.toEqual([])
  })

  it('reuses verified content for same-folder renames and cross-folder moves', async () => {
    await seed()
    await seed('archive', 'before', ['archive/older.md'])
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi.fn(),
    } as unknown as GitHubApi
    await updateRepositoryCacheAfterMutation(
      database!,
      api,
      scope.owner,
      scope.repo,
      scope.branch,
      { commitSha: 'after', parentCommitSha: 'before' },
      [
        { path: 'posts/first.md', removed: true },
        {
          path: 'posts/renamed.md',
          removed: false,
          sourcePath: 'posts/first.md',
          sha: 'blob-one',
        },
        { path: 'posts/second.md', removed: true },
        {
          path: 'archive/moved.md',
          removed: false,
          sourcePath: 'posts/second.md',
          sha: 'blob-one',
        },
      ],
    )
    expect(api.getFiles).not.toHaveBeenCalled()
    const rows = await database!.select().from(cacheFileTable)
    expect(rows.map((row) => row.path).sort()).toEqual([
      'archive/moved.md',
      'archive/older.md',
      'posts/renamed.md',
    ])
    expect(rows.find((row) => row.path === 'archive/moved.md')?.content).toBe(
      entry('posts/second.md').content,
    )
  })

  it('keeps node-file enrichment out of parent snapshots and follows changed filenames', async () => {
    await seed('posts/guide', 'before', ['posts/guide/index.md'])
    const directory = {
      ...entry('posts/guide'),
      type: 'dir' as const,
      content: null,
      sha: null,
    }
    const api = {
      getRefSha: vi.fn().mockResolvedValue('before'),
      getDirectory: vi.fn().mockResolvedValue([directory]),
      getFiles: vi.fn().mockResolvedValue([entry('posts/guide/other.md')]),
    } as unknown as GitHubApi
    const cache = createDirectoryCache({ database: database! })
    const input = {
      ...scope,
      context: 'collection' as const,
      api,
      enabled: true,
      nodeFilename: 'index.md',
    }
    const first = await cache.get(input)
    expect(first.entries.map((row) => row.path)).toEqual([
      'posts/guide',
      'posts/guide/index.md',
    ])
    expect(api.getFiles).not.toHaveBeenCalled()
    const second = await cache.get({ ...input, nodeFilename: 'other.md' })
    expect(second.entries.map((row) => row.path)).toEqual([
      'posts/guide',
      'posts/guide/other.md',
    ])
    expect(api.getFiles).toHaveBeenCalledWith(
      scope.owner,
      scope.repo,
      'before',
      ['posts/guide/other.md'],
      true,
      true,
    )
    const rows = await database!.select().from(cacheFileTable)
    expect(
      rows.find((row) => row.path === 'posts/guide/index.md')?.parentPath,
    ).toBe('posts/guide')
    expect(rows.some((row) => row.path === 'posts/guide/other.md')).toBe(false)
    const plain = await cache.get({ ...input, nodeFilename: undefined })
    expect(plain.entries.map((row) => row.path)).toEqual(['posts/guide'])
  })

  it('enriches large node collections using only snapshots at the parent revision', async () => {
    const directories = Array.from({ length: 125 }, (_, index) => ({
      ...entry(`posts/guide-${index}`),
      type: 'dir' as const,
      content: null,
      sha: null,
    }))
    for (const directory of directories)
      await seed(directory.path, 'before', [`${directory.path}/index.md`])
    await database!
      .update(cacheFileMetaTable)
      .set({ commitSha: 'older' })
      .where(eq(cacheFileMetaTable.path, directories[124].path))
    const missing = `${directories[124].path}/index.md`
    const api = {
      getRefSha: vi.fn().mockResolvedValue('before'),
      getDirectory: vi.fn().mockResolvedValue(directories),
      getFiles: vi.fn().mockResolvedValue([entry(missing)]),
    } as unknown as GitHubApi
    const result = await createDirectoryCache({ database: database! }).get({
      ...scope,
      context: 'collection',
      api,
      enabled: true,
      nodeFilename: 'index.md',
    })
    expect(result.entries).toHaveLength(250)
    expect(new Set(result.entries.map((item) => item.path)).size).toBe(250)
    expect(api.getFiles).toHaveBeenCalledExactlyOnceWith(
      scope.owner,
      scope.repo,
      'before',
      [missing],
      true,
      true,
    )
  })

  it('honors file TTL and the -1 opt-out independently of branch-check freshness', async () => {
    await seed()
    await database!
      .update(cacheFileMetaTable)
      .set({ commitTimestamp: new Date(0), refreshedAt: new Date(0) })
    const original = cachePolicy(database!)
    const api = {
      getRefSha: vi.fn().mockResolvedValue('before'),
      getDirectory: vi
        .fn()
        .mockResolvedValue([entry('posts/first.md'), entry('posts/second.md')]),
    } as unknown as GitHubApi
    try {
      configureCachePolicy(database!, { ...original, fileMs: -1 })
      await createDirectoryCache({ database: database! }).get({
        ...scope,
        context: 'collection',
        api,
        enabled: true,
      })
      expect(api.getDirectory).not.toHaveBeenCalled()
      configureCachePolicy(database!, { ...original, fileMs: 1 })
      await createDirectoryCache({ database: database! }).get({
        ...scope,
        context: 'collection',
        api,
        enabled: true,
      })
      expect(api.getDirectory).toHaveBeenCalledTimes(1)
    } finally {
      configureCachePolicy(database!, original)
    }
  })

  it('preserves cached rows across repository and owner rename events, including retries', async () => {
    await observeRepositoryIdentity(database!, {
      id: 87654323,
      ownerId: 7,
      owner: scope.owner,
      repo: scope.repo,
    })
    await seed()
    await database!.insert(cacheFileMetaTable).values(
      await repositoryRows(database!, {
        ...scope,
        source: 'local:/workspace/site',
        commitSha: 'local',
        status: 'ok',
      }),
    )
    await database!.insert(cacheFileTable).values(
      await repositoryRows(database!, {
        ...scope,
        ...entry('posts/local.md', 'local'),
        source: 'local:/workspace/site',
        parentPath: 'posts',
        commitSha: 'local',
        updatedAt: new Date('2026-01-01'),
      }),
    )
    const before = await database!.select().from(cacheFileTable)
    const renamed = {
      action: 'renamed',
      repository: {
        id: 87654323,
        name: 'new-name',
        owner: { id: 7, login: scope.owner },
      },
      changes: { repository: { name: { from: scope.repo } } },
      installation: { id: 12 },
    }
    const resolve = vi.fn().mockResolvedValue({
      getRepository: vi.fn().mockResolvedValue({
        id: 87654323,
        ownerId: 7,
        owner: scope.owner,
        repo: 'new-name',
      }),
    })
    await handleGitHubWebhook(database!, 'repository', renamed, resolve)
    await handleGitHubWebhook(database!, 'repository', renamed, resolve)
    await handleGitHubWebhook(
      database!,
      'installation_target',
      {
        action: 'renamed',
        account: { id: 7, login: 'new-owner' },
        changes: { login: { from: scope.owner } },
        installation: { id: 12 },
      },
      resolve,
      database!,
      async () => ({ id: 7, login: 'new-owner' }),
    )
    const after = await database!.select().from(cacheFileTable)
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id))
    const githubRows = after.filter((row) => row.source === 'github.com')
    expect(
      githubRows.every(
        (row) => row.owner === 'new-owner' && row.repo === 'new-name',
      ),
    ).toBe(true)
    expect(
      after.find((row) => row.source === 'local:/workspace/site'),
    ).toMatchObject({ owner: scope.owner, repo: scope.repo })
    const metas = await database!.select().from(cacheFileMetaTable)
    expect(
      metas
        .filter((row) => row.source === 'github.com')
        .every((row) => row.owner === 'new-owner' && row.repo === 'new-name'),
    ).toBe(true)
    expect(
      metas.find((row) => row.source === 'local:/workspace/site'),
    ).toMatchObject({ owner: scope.owner, repo: scope.repo })
  })

  it('preserves unchanged row IDs and timestamps when reconciling a changed directory', async () => {
    await seed()
    const before = await database!.select().from(cacheFileTable)
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getDirectory: vi
        .fn()
        .mockResolvedValue([
          entry('posts/first.md'),
          entry('posts/new.md', 'new-blob'),
        ]),
    } as unknown as GitHubApi
    await createDirectoryCache({ database: database! }).refresh({
      ...scope,
      context: 'collection',
      api,
    })
    const rows = await database!.select().from(cacheFileTable)
    expect(rows.find((row) => row.path === 'posts/first.md')).toEqual(
      before.find((row) => row.path === 'posts/first.md'),
    )
    expect(rows.map((row) => row.path).sort()).toEqual([
      'posts/first.md',
      'posts/new.md',
    ])
    expect(api.getDirectory).toHaveBeenCalledWith(
      'pagescms',
      'website',
      'after',
      'posts',
    )
  })

  it('patches a push without evicting unchanged entries or unrelated directories', async () => {
    await seed()
    await seed('other')
    const before = await database!.select().from(cacheFileTable)
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi
        .fn()
        .mockResolvedValue([entry('posts/first.md', 'new-blob')]),
    } as unknown as GitHubApi
    await applyRepositoryPush(database!, api, {
      ...scope,
      before: 'before',
      after: 'after',
      changes: [{ path: 'posts/first.md', removed: false }],
    })
    const rows = await database!.select().from(cacheFileTable)
    expect(rows).toHaveLength(4)
    expect(rows.filter((row) => row.path !== 'posts/first.md')).toEqual(
      before.filter((row) => row.path !== 'posts/first.md'),
    )
    expect(rows.find((row) => row.path === 'posts/first.md')?.sha).toBe(
      'new-blob',
    )
    expect(
      (await database!.select().from(cacheFileMetaTable)).every(
        (row) => row.commitSha === 'after' && row.status === 'ok',
      ),
    ).toBe(true)
  })

  it('invalidates affected ancestor/node-file views but keeps unrelated folders fresh', async () => {
    await seed()
    await seed('posts/nested')
    await seed('other')
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi
        .fn()
        .mockResolvedValue([entry('posts/nested/first.md', 'new')]),
    } as unknown as GitHubApi
    await applyRepositoryPush(database!, api, {
      ...scope,
      before: 'before',
      after: 'after',
      changes: [{ path: 'posts/nested/first.md', removed: false }],
    })
    const metas = await database!.select().from(cacheFileMetaTable)
    expect(metas.find((row) => row.path === 'posts')?.status).toBe('stale')
    expect(metas.find((row) => row.path === 'other')?.status).toBe('ok')
    expect(metas.find((row) => row.path === 'posts/nested')?.commitSha).toBe(
      'after',
    )
  })

  it('ignores duplicate and out-of-order deliveries without downloading content', async () => {
    await seed('posts', 'after')
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi.fn(),
    } as unknown as GitHubApi
    const input = {
      ...scope,
      before: 'before',
      after: 'after',
      changes: [{ path: 'posts/first.md', removed: false }],
    }
    await applyRepositoryPush(database!, api, input)
    expect(api.getRefSha).not.toHaveBeenCalled()
    await applyRepositoryPush(database!, api, { ...input, after: 'older' })
    expect(api.getRefSha).toHaveBeenCalledTimes(1)
    expect(api.getFiles).not.toHaveBeenCalled()
    expect(
      (await database!.select().from(cacheFileMetaTable))[0]?.commitSha,
    ).toBe('after')
  })

  it('patches a 1,000-file push without touching an unchanged file', async () => {
    const paths = Array.from({ length: 1_000 }, (_, i) => `posts/${i}.md`)
    await seed('posts', 'before', [...paths, 'posts/unchanged.md'])
    const original = (
      await database!
        .select()
        .from(cacheFileTable)
        .where(eq(cacheFileTable.path, 'posts/unchanged.md'))
    )[0]
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi
        .fn()
        .mockResolvedValue(paths.map((path) => entry(path, 'new-blob'))),
    } as unknown as GitHubApi
    await applyRepositoryPush(database!, api, {
      ...scope,
      before: 'before',
      after: 'after',
      changes: paths.map((path) => ({ path, removed: false })),
    })
    expect(
      await database!
        .select({ total: count() })
        .from(cacheFileTable)
        .where(eq(cacheFileTable.sha, 'new-blob')),
    ).toEqual([{ total: 1_000 }])
    expect(
      (
        await database!
          .select()
          .from(cacheFileTable)
          .where(eq(cacheFileTable.path, 'posts/unchanged.md'))
      )[0],
    ).toEqual(original)
  })

  it('updates predecessor snapshots even when another directory already has the pushed revision', async () => {
    await seed('posts', 'after')
    await seed('other', 'before')
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi
        .fn()
        .mockResolvedValue([entry('other/first.md', 'new-blob')]),
    } as unknown as GitHubApi
    const getApi = vi.fn().mockResolvedValue(api)
    await applyRepositoryPush(
      database!,
      { source: 'github.com', getApi },
      {
        ...scope,
        before: 'before',
        after: 'after',
        changes: [{ path: 'other/first.md', removed: false }],
      },
    )
    expect(getApi).toHaveBeenCalledTimes(1)
    expect(api.getFiles).toHaveBeenCalledWith(
      scope.owner,
      scope.repo,
      'after',
      ['other/first.md'],
      true,
    )
    expect(
      (await database!.select().from(cacheFileMetaTable)).every(
        (row) => row.commitSha === 'after' && row.status === 'ok',
      ),
    ).toBe(true)
  })

  it('does not overwrite a newer snapshot published during the first branch-head request', async () => {
    await seed()
    const api = {
      getRefSha: vi.fn().mockImplementation(async () => {
        await database!
          .update(cacheFileMetaTable)
          .set({ commitSha: 'newer', updatedAt: new Date('2030-01-01') })
        return 'after'
      }),
      getFiles: vi
        .fn()
        .mockResolvedValue([entry('posts/first.md', 'new-blob')]),
    } as unknown as GitHubApi
    const original = await database!.select().from(cacheFileTable)
    await applyRepositoryPush(database!, api, {
      ...scope,
      before: 'before',
      after: 'after',
      changes: [{ path: 'posts/first.md', removed: false }],
    })
    expect(
      (await database!.select().from(cacheFileMetaTable))[0]?.commitSha,
    ).toBe('newer')
    expect(await database!.select().from(cacheFileTable)).toEqual(original)
  })

  it('reuses a saved entry body without another content fetch', async () => {
    await seed()
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi.fn(),
    } as unknown as GitHubApi
    const saved = {
      ...entry('posts/first.md', 'saved-blob'),
      content: 'saved body',
    }
    await updateRepositoryCacheAfterMutation(
      database!,
      api,
      scope.owner,
      scope.repo,
      scope.branch,
      { commitSha: 'after', parentCommitSha: 'before' },
      [{ path: saved.path, removed: false }],
      [saved],
    )
    expect(api.getFiles).not.toHaveBeenCalled()
    expect(
      (
        await database!
          .select()
          .from(cacheFileTable)
          .where(eq(cacheFileTable.path, saved.path))
      )[0]?.content,
    ).toBe('saved body')
    expect(
      (await database!.select().from(cacheFileMetaTable))[0]?.commitSha,
    ).toBe('after')
  })

  it('shares changed-file retrieval across co-located content and media without persisting URLs or media content', async () => {
    await seed()
    await database!.insert(cacheFileMetaTable).values(
      await repositoryRows(database!, {
        ...scope,
        context: 'media',
        commitSha: 'before',
        status: 'ok',
      }),
    )
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi.fn().mockResolvedValue([
        {
          ...entry('posts/first.md', 'new-blob'),
          downloadUrl: 'https://private.test/?token=secret',
        },
      ]),
    } as unknown as GitHubApi
    await applyRepositoryPush(database!, api, {
      ...scope,
      before: 'before',
      after: 'after',
      changes: [{ path: 'posts/first.md', removed: false }],
    })
    expect(api.getFiles).toHaveBeenCalledTimes(1)
    const rows = await database!.select().from(cacheFileTable)
    expect(rows.find((row) => row.context === 'media')?.content).toBeNull()
    expect(JSON.stringify(rows)).not.toContain('secret')
  })

  it('marks snapshots with a missing predecessor stale rather than certifying an incomplete patch', async () => {
    await seed('posts', 'missed-commit')
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi.fn(),
    } as unknown as GitHubApi
    await applyRepositoryPush(database!, api, {
      ...scope,
      before: 'before',
      after: 'after',
      changes: [{ path: 'posts/first.md', removed: false }],
    })
    expect(api.getFiles).not.toHaveBeenCalled()
    expect((await database!.select().from(cacheFileMetaTable))[0]?.status).toBe(
      'stale',
    )
    expect(
      await database!.select({ total: count() }).from(cacheFileTable),
    ).toEqual([{ total: 2 }])
  })

  it('handles push webhooks using the installation API and falls back without deleting cached rows', async () => {
    await seed()
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi
        .fn()
        .mockResolvedValue([entry('posts/first.md', 'new-blob')]),
    } as unknown as GitHubApi
    const resolve = vi.fn().mockResolvedValue(api)
    const payload = {
      repository: { owner: { login: scope.owner }, name: scope.repo },
      ref: 'refs/heads/main',
      installation: { id: 12 },
      before: 'before',
      after: 'after',
      commits: [
        {
          added: [],
          modified: ['posts/first.md'],
          removed: ['posts/second.md'],
        },
      ],
    }
    await handleGitHubWebhook(database!, 'push', payload, resolve)
    expect(resolve).toHaveBeenCalledWith(12, undefined)
    expect(
      (await database!.select().from(cacheFileTable)).map((row) => row.path),
    ).toEqual(['posts/first.md'])
    const files = await database!.select().from(cacheFileTable)
    const metas = await database!.select().from(cacheFileMetaTable)
    vi.mocked(resolve).mockClear()
    vi.mocked(api.getRefSha).mockClear()
    vi.mocked(api.getFiles).mockClear()
    await handleGitHubWebhook(database!, 'push', payload, resolve)
    expect(resolve).not.toHaveBeenCalled()
    expect(api.getRefSha).not.toHaveBeenCalled()
    expect(api.getFiles).not.toHaveBeenCalled()
    expect(await database!.select().from(cacheFileTable)).toEqual(files)
    expect(await database!.select().from(cacheFileMetaTable)).toEqual(metas)
    await handleGitHubWebhook(
      database!,
      'push',
      { ...payload, forced: true },
      resolve,
    )
    expect(
      await database!.select({ total: count() }).from(cacheFileTable),
    ).toEqual([{ total: 1 }])
    expect((await database!.select().from(cacheFileMetaTable))[0]?.status).toBe(
      'stale',
    )
  })

  it('keeps old rows but marks them stale when a changed-file batch fails', async () => {
    await seed()
    const before = await database!.select().from(cacheFileTable)
    const api = {
      getRefSha: vi.fn().mockResolvedValue('after'),
      getFiles: vi.fn().mockRejectedValue(new Error('rate limited')),
    } as unknown as GitHubApi
    await expect(
      applyRepositoryPush(database!, api, {
        ...scope,
        before: 'before',
        after: 'after',
        changes: [{ path: 'posts/first.md', removed: false }],
      }),
    ).rejects.toThrow('rate limited')
    expect(await database!.select().from(cacheFileTable)).toEqual(before)
    expect((await database!.select().from(cacheFileMetaTable))[0]?.status).toBe(
      'stale',
    )
  })

  it('retries a refresh invalidated while its content request is in flight', async () => {
    await seed()
    let release!: (entries: ReturnType<typeof entry>[]) => void
    let started!: () => void
    const fetching = new Promise<void>((resolve) => {
      started = resolve
    })
    const api = {
      getRefSha: vi
        .fn()
        .mockResolvedValueOnce('old-head')
        .mockResolvedValue('new-head'),
      getDirectory: vi
        .fn()
        .mockImplementationOnce(() => {
          started()
          return new Promise((resolve) => {
            release = resolve
          })
        })
        .mockResolvedValue([entry('posts/current.md')]),
    } as unknown as GitHubApi
    const result = createDirectoryCache({ database: database! }).refresh({
      ...scope,
      context: 'collection',
      api,
    })
    await fetching
    await staleDirectoryCache(
      database!,
      scope.owner,
      scope.repo,
      scope.branch,
      ['posts/first.md'],
    )
    release([entry('posts/obsolete.md')])
    await result
    expect(
      (await database!.select().from(cacheFileTable)).map((row) => row.path),
    ).toEqual(['posts/current.md'])
    expect(
      (await database!.select().from(cacheFileMetaTable))[0]?.commitSha,
    ).toBe('new-head')
  })
})
