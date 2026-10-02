import { count, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatabase } from '#/server/database/client.server'
import {
  cacheFileMetaTable,
  cacheFileTable,
  collaboratorInviteTable,
  configTable,
} from '#/server/database/schema'
import { saveConfigurationSource } from '#/server/configuration-editor.server'
import { createConfigurationStore } from '#/server/configuration-store.server'
import { cachePolicy, configureCachePolicy } from '#/server/cache-policy.server'
import {
  createDirectoryCache,
  invalidateDirectoryCache,
  staleDirectoryCache,
} from '#/server/directory-cache.server'
import {
  applyRepositoryPush,
  updateRepositoryCacheAfterMutation,
} from '#/server/repository-cache.server'
import { handleGitHubWebhook } from '#/server/github-webhook.server'

import type { GitHubApi } from '#/server/github-api.server'

const databaseUrl = process.env.TEST_DATABASE_URL
const integration = databaseUrl ? describe : describe.skip
const database = databaseUrl ? createDatabase({ url: databaseUrl }) : null

integration('SQLite integration', () => {
  beforeEach(async () => {
    await database!.delete(cacheFileTable)
    await database!.delete(cacheFileMetaTable)
    await database!.delete(collaboratorInviteTable)
    await database!.delete(configTable)
  })

  it('applies every legacy-compatible migration', async () => {
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
        'cache_permission',
        'action_run',
      ]),
    )
  })

  it('enforces case-insensitive invitation uniqueness', async () => {
    const invitation = {
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
    await database!
      .insert(cacheFileMetaTable)
      .values({ ...scope, path, commitSha: revision, status: 'ok' })
    await database!.insert(cacheFileTable).values(
      paths.map((filePath) => ({
        ...scope,
        ...entry(filePath),
        parentPath: filePath.slice(0, filePath.lastIndexOf('/')),
        commitSha: revision,
        updatedAt: new Date('2026-01-01'),
      })),
    )
  }

  it('reuses a collection snapshot for a colocated media listing without exposing content', async () => {
    await seed()
    const api = {
      getMediaDirectory: vi.fn(),
      getRefSha: vi.fn(),
    } as unknown as GitHubApi
    const result = await createDirectoryCache({ database: database! }).get({
      ...scope,
      context: 'media',
      enabled: true,
      api,
    })
    expect(result.entries.map((file) => file.path)).toEqual([
      'posts/first.md',
      'posts/second.md',
    ])
    expect(
      result.entries.every(
        (file) => file.content === null && file.downloadUrl === null,
      ),
    ).toBe(true)
    expect(api.getMediaDirectory).not.toHaveBeenCalled()
    expect(api.getRefSha).not.toHaveBeenCalled()
  })

  it('writes the submitted configuration through to the parsed cache', async () => {
    const api = {
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
      source: 'content: []\nsettings:\n  cache: true\n',
      sha: 'old',
    })
    const calls = vi.mocked(api.getFile).mock.calls.length
    const configuration = await createConfigurationStore({
      database: database!,
    }).get(api, scope.owner, scope.repo, scope.branch)
    expect(configuration?.sha).toBe('new')
    expect(api.getFile).toHaveBeenCalledTimes(calls)
  })

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
    await handleGitHubWebhook(database!, 'push', push(121), async () => api)
    let metas = await database!.select().from(cacheFileMetaTable)
    expect(metas.find((row) => row.path === 'posts')?.status).toBe('stale')
    expect(metas.find((row) => row.path === 'other')?.status).toBe('ok')
    await handleGitHubWebhook(database!, 'push', push(801), async () => api)
    metas = await database!.select().from(cacheFileMetaTable)
    expect(metas.every((row) => row.status === 'stale')).toBe(true)
    expect(await database!.select().from(cacheFileTable)).toEqual(before)
    expect(api.getFiles).not.toHaveBeenCalled()
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
    )
    const rows = await database!.select().from(cacheFileTable)
    expect(
      rows.find((row) => row.path === 'posts/guide/index.md')?.parentPath,
    ).toBe('posts/guide')
    expect(rows.some((row) => row.path === 'posts/guide/other.md')).toBe(false)
    const plain = await cache.get({ ...input, nodeFilename: undefined })
    expect(plain.entries.map((row) => row.path)).toEqual(['posts/guide'])
  })

  it('honors file TTL and the -1 opt-out independently of branch-check freshness', async () => {
    await seed()
    await database!
      .update(cacheFileMetaTable)
      .set({ commitTimestamp: new Date(0) })
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
    await seed()
    await database!.insert(cacheFileMetaTable).values({
      ...scope,
      source: 'local:/workspace/site',
      commitSha: 'local',
      status: 'ok',
    })
    await database!.insert(cacheFileTable).values({
      ...scope,
      ...entry('posts/local.md', 'local'),
      source: 'local:/workspace/site',
      parentPath: 'posts',
      commitSha: 'local',
      updatedAt: new Date('2026-01-01'),
    })
    const before = await database!.select().from(cacheFileTable)
    const renamed = {
      action: 'renamed',
      repository: { id: 5, name: 'new-name', owner: { login: scope.owner } },
      changes: { repository: { name: { from: scope.repo } } },
    }
    await handleGitHubWebhook(database!, 'repository', renamed)
    await handleGitHubWebhook(database!, 'repository', renamed)
    await handleGitHubWebhook(database!, 'installation_target', {
      action: 'renamed',
      account: { id: 7, login: 'new-owner' },
      changes: { login: { from: scope.owner } },
    })
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
    await applyRepositoryPush(database!, api, { ...input, after: 'older' })
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
    await database!
      .insert(cacheFileMetaTable)
      .values({ ...scope, context: 'media', commitSha: 'before', status: 'ok' })
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
    expect(resolve).toHaveBeenCalledWith(12)
    expect(
      (await database!.select().from(cacheFileTable)).map((row) => row.path),
    ).toEqual(['posts/first.md'])
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
