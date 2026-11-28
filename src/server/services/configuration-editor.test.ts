import { afterEach, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'

import {
  loadConfigurationSource,
  saveConfigurationSource,
} from '#/server/services/configuration-editor'
import { createRepositoryService } from '#/server/__tests__/credentials'
import {
  InvalidConfigurationError,
  createConfigurationStore,
} from '#/server/cache/configuration'
import { createLibSqlDatabase } from '#/server/db/client'
import {
  activityTable,
  cacheFileMetaTable,
  cacheFileTable,
  configTable,
  repositoryTable,
} from '#/server/db/schema'
import { RepositoryProviderError } from '#/server/repository/provider'
import type { RepositoryApi } from '#/server/repository/provider'
import { createConfigurationReader } from '#/server/cache/configuration-read'
import * as databaseSql from '#/server/db/sql'
import * as directoryCache from '#/server/cache/directory'

const clients: ReturnType<typeof createClient>[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.close()
})

const localSource = 'local:/workspace/repo'
const customCommit =
  'settings:\n  commit:\n    identity: user\n    templates:\n      update: "Configure {path}"\n'
const user = {
  id: 'user',
  email: 'user@example.com',
  name: 'User',
  githubUsername: 'user',
}

async function fixture({
  remote,
  source,
  canPush = true,
}: {
  remote: string | Error
  source?: string
  canPush?: boolean
}) {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  const api = {
    ...(source ? { source } : {}),
    getRepository: vi.fn().mockResolvedValue({
      id: 10,
      ownerId: 20,
      owner: 'owner',
      repo: 'repo',
      defaultBranch: 'main',
      canPush,
      private: false,
    }),
    branchExists: vi.fn().mockResolvedValue(true),
    getFile: vi.fn(async () => {
      if (remote instanceof Error) throw remote
      return { sha: 'old', content: btoa(remote) }
    }),
    putFile: vi.fn().mockResolvedValue({
      sha: 'new',
      commitSha: 'after',
      path: '.pages.yml',
    }),
  }
  const input = {
    database,
    repositoryAccess: {
      resolve: vi.fn().mockResolvedValue({ api, tokenSource: 'user' }),
      readConfigurationFile: (
        _api: RepositoryApi,
        _owner: string,
        _repo: string,
        _branch: string,
      ) => api.getFile(),
      clearConfigurationReads: () => {},
    },
    user,
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    source: 'content: []\n',
    sha: 'old' as string | null,
  }
  const store = createConfigurationStore({ database })
  const row = (rowSource: string) =>
    database.query.configTable.findFirst({
      where: and(
        eq(configTable.source, rowSource),
        eq(configTable.branch, 'main'),
      ),
    })
  return { database, api, input, store, row }
}

describe('configuration source saving', () => {
  it('does not share a pre-save refresh with a refresh started after saving', async () => {
    const { api, input, store, database } = await fixture({
      remote: 'content: []',
    })
    await store.save('owner', 'repo', 'main', 'old', { content: [] })
    let release!: () => void
    api.getFile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { sha: 'old', content: btoa('content: []') }
    })
    const old = store.refresh(
      api as unknown as RepositoryApi,
      'owner',
      'repo',
      'main',
    )
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await saveConfigurationSource(input)
    api.getFile.mockResolvedValueOnce({
      sha: 'new',
      content: btoa('content: []\n# updated'),
    })
    const current = await createConfigurationStore({ database }).refresh(
      api as unknown as RepositoryApi,
      'owner',
      'repo',
      'main',
    )
    expect(current?.sha).toBe('new')
    release()
    await old
    expect((await store.find('owner', 'repo', 'main'))?.sha).toBe('new')
  })

  it('detaches an old read before publishing a saved configuration', async () => {
    const { api, input, store, database } = await fixture({
      remote: 'content: []',
    })
    await store.save('owner', 'repo', 'main', 'old', { content: [] })
    let releaseOld!: () => void
    api.getFile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseOld = resolve
      })
      return { sha: 'old', content: btoa('content: []') }
    })
    const old = store.refresh(
      api as unknown as RepositoryApi,
      'owner',
      'repo',
      'main',
    )
    await vi.waitFor(() => expect(releaseOld).toBeTypeOf('function'))
    let resumeSave!: () => void
    const originalStale = directoryCache.staleDirectoryCache
    const spy = vi
      .spyOn(directoryCache, 'staleDirectoryCache')
      .mockImplementationOnce(async (...args) => {
        await new Promise<void>((resolve) => {
          resumeSave = resolve
        })
        return originalStale(...args)
      })
    try {
      const saving = saveConfigurationSource(input)
      await vi.waitFor(() => expect(resumeSave).toBeTypeOf('function'))
      api.getFile.mockResolvedValueOnce({
        sha: 'new',
        content: btoa('content: []\n# updated'),
      })
      const afterSave = createConfigurationStore({ database }).refresh(
        api as unknown as RepositoryApi,
        'owner',
        'repo',
        'main',
      )
      await vi.waitFor(() => expect(api.getFile).toHaveBeenCalledTimes(2))
      expect((await afterSave)?.sha).toBe('new')
      releaseOld()
      await old
      resumeSave()
      await saving
      expect((await store.find('owner', 'repo', 'main'))?.sha).toBe('new')
    } finally {
      spy.mockRestore()
    }
  })

  it('keeps the verified repository identity when saving', async () => {
    const { input } = await fixture({ remote: 'content: []\n' })
    await saveConfigurationSource({ ...input, repoId: '10' })
    expect(input.repositoryAccess.resolve).toHaveBeenCalledWith(
      user,
      'owner',
      'repo',
      'main',
      '10',
    )
  })

  it('does not save when the repository identity no longer matches', async () => {
    const { input, api } = await fixture({ remote: 'content: []\n' })
    input.repositoryAccess.resolve.mockRejectedValueOnce(
      new Error(
        'The repository at this address changed. Reload before continuing.',
      ),
    )
    await expect(
      saveConfigurationSource({ ...input, repoId: '10' }),
    ).rejects.toThrow('repository at this address changed')
    expect(api.putFile).not.toHaveBeenCalled()
  })

  it.each([
    'content: [\n',
    'media: *missing\n',
    'components:\n  loop:\n    type: object\n    fields:\n      - name: child\n        component: loop\n',
  ])(
    'repairs malformed remote YAML with default commit settings: %s',
    async (remote) => {
      const { api, input, store, row } = await fixture({ remote })
      await expect(saveConfigurationSource(input)).resolves.toMatchObject({
        sha: 'new',
      })
      expect(api.putFile).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: 'old',
          message: 'Update .pages.yml (via Pages CMS)',
          content: btoa(input.source),
        }),
      )
      expect(api.putFile.mock.calls[0]?.[0]).not.toHaveProperty('committer')
      expect(await row('github.com')).toMatchObject({ sha: 'new' })
      // The repaired cache is served without reparsing the old remote file.
      const calls = api.getFile.mock.calls.length
      await expect(
        store.get(api as unknown as RepositoryApi, 'owner', 'repo', 'main'),
      ).resolves.toMatchObject({ sha: 'new', object: { content: [] } })
      expect(api.getFile).toHaveBeenCalledTimes(calls)
    },
  )

  it('rejects duplicate identities without writing or replacing the valid cache', async () => {
    const { input, api, store, row } = await fixture({ remote: 'content: []' })
    await store.save('owner', 'repo', 'main', 'previous', { content: [] })
    await expect(
      saveConfigurationSource({
        ...input,
        source:
          'content:\n  - name: posts\n    type: collection\n    path: posts\n  - name: posts\n    type: file\n    path: settings.yml\n',
      }),
    ).rejects.toThrow('Duplicate content name')
    expect(api.putFile).not.toHaveBeenCalled()
    expect(await row('github.com')).toMatchObject({ sha: 'previous' })
  })

  it('retains the old cache but rejects a refresh of invalid remote config', async () => {
    const { api, store, row } = await fixture({ remote: 'content: wrong' })
    await store.save('owner', 'repo', 'main', 'previous', { content: [] })
    await expect(
      store.refresh(api as unknown as RepositoryApi, 'owner', 'repo', 'main'),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(await row('github.com')).toMatchObject({ sha: 'previous' })
  })

  it('keeps custom commit settings from the replaced remote configuration', async () => {
    const { api, input } = await fixture({ remote: customCommit })
    await saveConfigurationSource(input)
    expect(api.getFile).toHaveBeenCalledOnce()
    expect(api.putFile).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Configure .pages.yml',
        committer: { name: 'User', email: 'user@example.com' },
      }),
    )
  })

  it('uses cached commit settings only when they match the replaced file', async () => {
    const { api, input, store } = await fixture({ remote: 'content: [\n' })
    input.sha = 'cached-commit'
    await store.save('owner', 'repo', 'main', 'cached-commit', {
      settings: { commit: { templates: { update: 'Cached {path}' } } },
    })
    await saveConfigurationSource(input)
    expect(api.getFile).not.toHaveBeenCalled()
    expect(api.putFile).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Cached .pages.yml' }),
    )

    // A cached row for another revision does not describe the replaced file.
    await store.save('owner', 'repo', 'main', 'other', {
      settings: { commit: { templates: { update: 'Cached {path}' } } },
    })
    await saveConfigurationSource(input)
    expect(api.getFile).toHaveBeenCalledOnce()
    expect(api.putFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Update .pages.yml (via Pages CMS)' }),
    )
  })

  it.each([401, 403, 500])(
    'propagates provider %i errors while reading the replaced file',
    async (status) => {
      const { api, input } = await fixture({
        remote: new RepositoryProviderError('failed', status),
      })
      await expect(saveConfigurationSource(input)).rejects.toThrow('failed')
      expect(api.putFile).not.toHaveBeenCalled()
    },
  )

  it('creates without reading a replaced file', async () => {
    const { api, input } = await fixture({ remote: customCommit })
    await saveConfigurationSource({ ...input, sha: null })
    expect(api.getFile).not.toHaveBeenCalled()
    expect(api.putFile).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Create .pages.yml (via Pages CMS)' }),
    )
  })

  it('requires manager access before reading or writing', async () => {
    const { api, input } = await fixture({
      remote: customCommit,
      canPush: false,
    })
    await expect(saveConfigurationSource(input)).rejects.toThrow(
      'Repository write access is required',
    )
    expect(api.getFile).not.toHaveBeenCalled()
    expect(api.putFile).not.toHaveBeenCalled()
  })

  it('isolates commit settings and cache writes by repository source', async () => {
    const { database, api, input, store, row } = await fixture({
      remote: 'content: [\n',
      source: localSource,
    })
    await store.save('owner', 'repo', 'main', 'old', {
      settings: { commit: { templates: { update: 'GitHub {path}' } } },
    })
    await saveConfigurationSource(input)
    expect(api.putFile).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Update .pages.yml (via Pages CMS)' }),
    )
    expect(await row('github.com')).toMatchObject({ sha: 'old' })
    expect(await row(localSource)).toMatchObject({ sha: 'new' })
    const identities = await database
      .select({ source: repositoryTable.source })
      .from(repositoryTable)
    expect(identities.map(({ source }) => source).sort()).toEqual([
      'github.com',
      localSource,
    ])
  })

  it('removes only the same-source cache row when the cache write fails', async () => {
    const { database, api, input, store, row } = await fixture({
      remote: 'content: []\n',
      source: localSource,
    })
    await store.save('owner', 'repo', 'main', 'old', { content: [] })
    await store.save(
      'owner',
      'repo',
      'main',
      'old',
      { content: [] },
      localSource,
    )
    await database.run(
      sql.raw(
        "CREATE TRIGGER fail_config_write BEFORE UPDATE ON config WHEN NEW.sha = 'new' BEGIN SELECT RAISE(ABORT, 'cache write failed'); END",
      ),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(saveConfigurationSource(input)).resolves.toMatchObject({
      sha: 'new',
    })
    expect(api.putFile).toHaveBeenCalledOnce()
    expect(await row(localSource)).toBeUndefined()
    expect(await row('github.com')).toMatchObject({ sha: 'old' })
  })
})

it('keeps the verified repository identity when reading the source', async () => {
  const { input } = await fixture({ remote: 'content: []\n' })
  await loadConfigurationSource({ ...input, repoId: '10' })
  expect(input.repositoryAccess.resolve).toHaveBeenCalledWith(
    user,
    'owner',
    'repo',
    'main',
    '10',
  )
})

it('shares a cold project configuration read with the editor in one request', async () => {
  const { database, input, api } = await fixture({ remote: 'content: []\n' })
  const reader = createConfigurationReader()
  input.repositoryAccess.readConfigurationFile = reader.read
  const projects = createRepositoryService(
    database,
    database,
    input.repositoryAccess,
  )
  await projects.openRepository(user, 'owner', 'repo', 'main')
  await expect(loadConfigurationSource(input)).resolves.toEqual({
    source: 'content: []\n',
    sha: 'old',
  })
  expect(api.getFile).toHaveBeenCalledTimes(1)
})

it('decodes UTF-8 and whitespace in the configuration source', async () => {
  const { input, api } = await fixture({ remote: 'content: []\n' })
  const source = '# Café 🐈\ncontent: []\n'
  api.getFile.mockResolvedValue({
    sha: 'unicode',
    content: Buffer.from(source)
      .toString('base64')
      .replace(/(.{12})/g, '$1\n'),
  })
  await expect(loadConfigurationSource(input)).resolves.toEqual({
    source,
    sha: 'unicode',
  })
})

it('does not reuse a configuration read after saving in the same request', async () => {
  const { input, api } = await fixture({ remote: 'content: []\n' })
  const reader = createConfigurationReader()
  input.repositoryAccess.readConfigurationFile = reader.read
  input.repositoryAccess.clearConfigurationReads = reader.clear
  let remote = 'content: []\n'
  let revision = 'old'
  api.getFile.mockImplementation(async () => ({
    sha: revision,
    content: btoa(remote),
  }))
  api.putFile.mockImplementation(async () => {
    remote = 'content: []\n# updated\n'
    revision = 'new'
    return { sha: revision, commitSha: 'after', path: '.pages.yml' }
  })
  await loadConfigurationSource(input)
  await saveConfigurationSource(input)
  await expect(loadConfigurationSource(input)).resolves.toEqual({
    source: 'content: []\n# updated\n',
    sha: 'new',
  })
})

it('does not reuse a configuration read after a conflicting save', async () => {
  const { input, api } = await fixture({ remote: 'content: []\n' })
  const reader = createConfigurationReader()
  input.repositoryAccess.readConfigurationFile = reader.read
  input.repositoryAccess.clearConfigurationReads = reader.clear
  let remote = 'content: []\n'
  let revision = 'old'
  api.getFile.mockImplementation(async () => ({
    sha: revision,
    content: btoa(remote),
  }))
  api.putFile.mockImplementation(async () => {
    remote = 'content: []\n# concurrent update\n'
    revision = 'new'
    throw new RepositoryProviderError('conflict', 409)
  })
  await loadConfigurationSource(input)
  await expect(saveConfigurationSource(input)).rejects.toThrow()
  await expect(loadConfigurationSource(input)).resolves.toEqual({
    source: 'content: []\n# concurrent update\n',
    sha: 'new',
  })
})

describe('malformed configuration recovery', () => {
  const malformed = [
    'content:\n  - name: posts\n    type: collection\n    path: posts\n  - name: posts\n    type: file\n    path: settings.yml\n',
    'content: [',
    'content: wrong',
    'components:\n  loop:\n    type: object\n    fields:\n      - name: child\n        component: loop\n',
  ]

  it.each(malformed)(
    'lets managers open, read and repair invalid source: %s',
    async (remote) => {
      const { database, input, api } = await fixture({ remote })
      const projects = createRepositoryService(
        database,
        database,
        input.repositoryAccess,
      )
      await expect(
        projects.openRepository(user, 'owner', 'repo', 'main'),
      ).resolves.toMatchObject({
        configuration: null,
        branchExists: true,
        configurationInvalid: true,
      })
      await expect(loadConfigurationSource(input)).resolves.toEqual({
        source: remote,
        sha: 'old',
      })
      // Content callers still fail closed; bootstrap did not cache an empty config.
      await expect(
        createConfigurationStore({ database }).get(
          api as unknown as RepositoryApi,
          'owner',
          'repo',
          'main',
        ),
      ).rejects.toBeInstanceOf(InvalidConfigurationError)
      await saveConfigurationSource(input)
      await expect(
        projects.openRepository(user, 'owner', 'repo', 'main'),
      ).resolves.toMatchObject({
        configuration: { sha: 'new', object: { content: [] } },
        configurationInvalid: false,
      })
    },
  )

  it.each(['read-only', 'installation'] as const)(
    'does not grant recovery to %s access',
    async (kind) => {
      const { database, input } = await fixture({
        remote: 'content: [',
        canPush: kind !== 'read-only',
      })
      if (kind === 'installation')
        input.repositoryAccess.resolve.mockResolvedValue({
          api: (await input.repositoryAccess.resolve()).api,
          tokenSource: 'installation',
        })
      const projects = createRepositoryService(
        database,
        database,
        input.repositoryAccess,
      )
      await expect(
        projects.openRepository(user, 'owner', 'repo', 'main'),
      ).rejects.toBeInstanceOf(InvalidConfigurationError)
    },
  )

  it('does not hide database errors during bootstrap', async () => {
    const { database, input } = await fixture({ remote: 'content: []' })
    const error = new Error('Database unavailable')
    vi.spyOn(databaseSql, 'first').mockRejectedValueOnce(error)
    const projects = createRepositoryService(
      database,
      database,
      input.repositoryAccess,
    )
    await expect(
      projects.openRepository(user, 'owner', 'repo', 'main'),
    ).rejects.toBe(error)
  })

  it('does not hide provider errors during bootstrap', async () => {
    const error = new Error('Storage unavailable')
    const { database, input } = await fixture({ remote: error })
    const projects = createRepositoryService(
      database,
      database,
      input.repositoryAccess,
    )
    await expect(
      projects.openRepository(user, 'owner', 'repo', 'main'),
    ).rejects.toBe(error)
  })
})

// A successful write must keep its original identity after an address is reused.
it('does not cache a saved config against a replacement repository', async () => {
  const { database, input, api, store } = await fixture({
    remote: 'content: []\n',
  })
  const { observeRepositoryIdentity } =
    await import('#/server/access/repository-identity')
  await observeRepositoryIdentity(database, {
    owner: 'owner',
    repo: 'repo',
    id: 10,
    ownerId: 20,
  })
  api.putFile.mockImplementationOnce(async () => {
    await observeRepositoryIdentity(
      database,
      { owner: 'owner', repo: 'renamed', id: 10, ownerId: 20 },
      { owner: 'owner', repo: 'repo' },
    )
    await observeRepositoryIdentity(database, {
      owner: 'owner',
      repo: 'repo',
      id: 11,
      ownerId: 20,
    })
    return { sha: 'new', commitSha: 'after', path: '.pages.yml' }
  })
  await saveConfigurationSource({ ...input, repoId: '10' })
  expect(await store.find('owner', 'repo', 'main')).toBeNull()
  expect(await store.find('owner', 'renamed', 'main')).toMatchObject({
    sha: 'new',
  })
})

it.each([
  'publish',
  'invalidate',
  'cache-failure',
  'without-client-id',
] as const)(
  'pins %s and activity to separate core/cache identities across address reuse',
  async (mode) => {
    const { observeRepositoryIdentity } =
      await import('#/server/access/repository-identity')
    const { withActivityCapture } = await import('#/server/activity/capture')
    const { createAccessPolicyGateway } = await import('#/server/access/policy')
    const core = await fixture({ remote: 'content: []\n' })
    const { database, input, api, store } = await fixture({
      remote: 'content: []\n',
    })
    await observeRepositoryIdentity(database, {
      owner: 'other',
      repo: 'padding',
      id: 99,
    })
    const coreIdentity = await observeRepositoryIdentity(core.database, {
      owner: 'owner',
      repo: 'repo',
      id: 10,
      ownerId: 20,
    })
    const cacheIdentity = await observeRepositoryIdentity(database, {
      owner: 'owner',
      repo: 'repo',
      id: 10,
      ownerId: 20,
    })
    expect(cacheIdentity.id).not.toBe(coreIdentity.id)
    const admission = {
      api,
      tokenSource: 'user',
      repository: await api.getRepository(),
      identity: {
        applicationId: coreIdentity.id,
        cacheId: cacheIdentity.id,
        externalId: '10',
        source: 'github.com',
      },
    }
    input.repositoryAccess.resolve.mockResolvedValue(admission)
    await store.save('owner', 'repo', 'main', 'old', { content: [] })
    const snapshot = {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: '',
      context: 'collection',
      commitSha: 'before',
      status: 'ok',
    }
    await database
      .insert(cacheFileMetaTable)
      .values({ ...snapshot, repositoryId: cacheIdentity.id })
    Object.assign(api, { getRefSha: vi.fn().mockResolvedValue('after') })
    if (mode === 'cache-failure') {
      await database.run(
        sql.raw(
          "CREATE TRIGGER fail_saved_config BEFORE UPDATE ON config WHEN NEW.sha = 'new' BEGIN SELECT RAISE(ABORT, 'cache write failed'); END",
        ),
      )
    }
    let replacementId = 0
    api.putFile.mockImplementationOnce(async () => {
      for (const target of [core.database, database]) {
        await observeRepositoryIdentity(
          target,
          { owner: 'owner', repo: 'renamed', id: 10, ownerId: 20 },
          { owner: 'owner', repo: 'repo' },
        )
        const replacement = await observeRepositoryIdentity(target, {
          owner: 'owner',
          repo: 'repo',
          id: 11,
          ownerId: 20,
        })
        if (target === database) replacementId = replacement.id
      }
      await store.save('owner', 'repo', 'main', 'replacement', { content: [] })
      await database
        .insert(cacheFileMetaTable)
        .values({ ...snapshot, repositoryId: replacementId })
      return {
        sha: 'new',
        commitSha: 'after',
        path: '.pages.yml',
        ...(mode === 'publish' ? { parentCommitSha: 'before' } : {}),
      }
    })
    const access = withActivityCapture(
      createAccessPolicyGateway({}),
      core.database,
      database,
    )
    await access.execute(
      {
        operation: 'configuration.update',
        principal: { type: 'user', id: user.id },
        tenant: { type: 'repository', id: 'owner/repo' },
        target: {
          repository: {
            owner: 'owner',
            repo: 'repo',
            ...(mode === 'without-client-id' ? {} : { repoId: '10' }),
          },
          branch: 'main',
          path: '.pages.yml',
        },
      },
      () => saveConfigurationSource({ ...input, repoId: '10' }),
    )
    expect(await store.find('owner', 'repo', 'main')).toMatchObject({
      sha: 'replacement',
    })
    const saved = await store.find('owner', 'renamed', 'main')
    if (mode === 'cache-failure') expect(saved).toBeNull()
    else
      expect(saved).toMatchObject({
        sha: 'new',
        repositoryId: cacheIdentity.id,
      })
    const snapshots = await database.select().from(cacheFileMetaTable)
    expect(
      snapshots.find((row) => row.repositoryId === replacementId),
    ).toMatchObject({ commitSha: 'before', status: 'ok' })
    expect(
      snapshots.find((row) => row.repositoryId === cacheIdentity.id),
    ).toMatchObject(
      mode === 'publish'
        ? { commitSha: 'after', status: 'ok' }
        : { status: 'stale' },
    )
    expect(
      (await database.select().from(cacheFileTable)).every(
        (row) => row.repositoryId === cacheIdentity.id,
      ),
    ).toBe(true)
    const events = await core.database.select().from(activityTable)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      repositoryId: coreIdentity.id,
      commitSha: 'after',
      area: 'configuration',
    })
  },
)

it.each([
  ['entry', 'context'],
  ['entry', 'write'],
  ['media', 'context'],
  ['media', 'write'],
] as const)(
  'keeps %s cache scope if the address changes during %s',
  async (kind, phase) => {
    const { observeRepositoryIdentity } =
      await import('#/server/access/repository-identity')
    const { saveRawEntry } = await import('#/server/content/entry-editor')
    const { uploadMedia } = await import('#/server/media/media')
    const { database, input, api, store } = await fixture({
      remote: 'content: []\n',
    })
    const metadata = await api.getRepository()
    const original = await observeRepositoryIdentity(database, metadata)
    await store.save('owner', 'repo', 'main', 'entry-media-schema', {
      content: [
        {
          name: 'posts',
          type: 'collection',
          path: 'posts',
          extension: 'txt',
          format: 'raw',
        },
      ],
      media: [{ name: 'images', input: 'images', output: '/images' }],
    })
    const root = kind === 'entry' ? 'posts' : 'images'
    const snapshot = {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: root,
      context: 'collection',
      commitSha: 'before',
      status: 'ok',
    }
    await database
      .insert(cacheFileMetaTable)
      .values({ ...snapshot, repositoryId: original.id })
    let replacementId = 0
    const reuseAddress = async () => {
      await observeRepositoryIdentity(
        database,
        { ...metadata, repo: 'renamed' },
        metadata,
      )
      replacementId = (
        await observeRepositoryIdentity(database, { ...metadata, id: 11 })
      ).id
      await store.save('owner', 'repo', 'main', 'replacement', {
        content: [],
        media: [],
      })
      await database
        .insert(cacheFileMetaTable)
        .values({ ...snapshot, repositoryId: replacementId })
    }
    input.repositoryAccess.resolve.mockImplementation(async () => {
      if (phase === 'context') await reuseAddress()
      return { api, repository: metadata, tokenSource: 'user' }
    })
    api.putFile.mockImplementationOnce(async () => {
      if (phase === 'write') await reuseAddress()
      return { sha: 'new', commitSha: 'after', path: `${root}/a.txt` }
    })
    if (kind === 'entry') {
      await saveRawEntry({
        ...input,
        name: 'posts',
        path: 'posts/a.txt',
        source: 'body',
        sha: 'old',
      })
    } else {
      const resolver = {
        resolveStorage: vi.fn(() => null),
        resolveDelivery: vi.fn(() => null),
      }
      await uploadMedia({
        ...input,
        name: 'images',
        filename: 'a.txt',
        content: btoa('body'),
        mediaProviderResolver: resolver,
      })
      for (const resolve of [resolver.resolveStorage, resolver.resolveDelivery])
        expect(resolve).toHaveBeenCalledWith(
          expect.objectContaining({ repoId: '10', ownerId: '20' }),
        )
    }
    expect(api.putFile).toHaveBeenCalledOnce()
    const snapshots = await database.select().from(cacheFileMetaTable)
    expect(
      snapshots.find((row) => row.repositoryId === original.id),
    ).toMatchObject({ status: 'stale' })
    expect(
      snapshots.find((row) => row.repositoryId === replacementId),
    ).toMatchObject({ status: 'ok', commitSha: 'before' })
  },
)

it('uses the cache database identity for activity resource classification', async () => {
  const { observeRepositoryIdentity } =
    await import('#/server/access/repository-identity')
  const { withActivityCapture } = await import('#/server/activity/capture')
  const { createAccessPolicyGateway } = await import('#/server/access/policy')
  const core = await fixture({ remote: 'content: []\n' })
  const cache = await fixture({ remote: 'content: []\n' })
  const coreIdentity = await observeRepositoryIdentity(core.database, {
    owner: 'owner',
    repo: 'repo',
    id: 10,
  })
  await observeRepositoryIdentity(cache.database, {
    owner: 'padding',
    repo: 'other',
    id: 99,
  })
  await cache.store.save('padding', 'other', 'main', 'wrong', { content: [] })
  const cacheIdentity = await observeRepositoryIdentity(cache.database, {
    owner: 'owner',
    repo: 'repo',
    id: 10,
  })
  expect(coreIdentity.id).not.toBe(cacheIdentity.id)
  await cache.store.save('owner', 'repo', 'main', 'right', {
    content: [{ name: 'settings', type: 'file', path: 'settings.json' }],
  })
  const access = withActivityCapture(
    createAccessPolicyGateway({}),
    core.database,
    cache.database,
  )
  await access.execute(
    {
      operation: 'entry.update',
      principal: { type: 'user', id: user.id },
      tenant: { type: 'repository', id: 'owner/repo' },
      target: {
        repository: { owner: 'owner', repo: 'repo', repoId: '10' },
        branch: 'main',
        collection: 'settings',
        path: 'settings.json',
      },
    },
    async () => ({ path: 'settings.json', commitSha: 'saved' }),
  )
  expect(await core.database.select().from(activityTable)).toMatchObject([
    {
      repositoryId: coreIdentity.id,
      area: 'file',
      resource: 'settings',
      path: 'settings.json',
    },
  ])
})
