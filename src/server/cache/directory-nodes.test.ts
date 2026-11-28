import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it, vi } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { createGitHubApi } from '#/server/github/api'
import { createDirectoryCache } from '#/server/cache/directory'
import { localizedDirectory } from '#/server/content/localized-directory'
import { normalizeContentI18n } from '#/lib/i18n'
import type { ContentSchema } from '#/shared/configuration-content'
import type { RepositoryDirectoryEntry } from '#/server/repository/provider'

it.each([false, true])(
  'reads node results through the directory path (localized: %s)',
  async (localized) => {
    const client = createClient({ url: 'file::memory:' })
    try {
      const database = createLibSqlDatabase(client)
      await migrate(database, { migrationsFolder: './drizzle' })
      const root = localized ? 'fr/posts' : 'posts'
      const node: RepositoryDirectoryEntry = {
        type: 'file',
        name: 'index.md',
        path: `${root}/a/index.md`,
        sha: 'blob',
        content: 'Title',
        size: 5,
        downloadUrl: null,
      }
      const getFiles = vi.fn(
        async (
          _owner: string,
          _repo: string,
          _revision: string,
          _paths: string[],
        ) => [node],
      )
      const getDirectory = vi.fn(
        async (
          _owner: string,
          _repo: string,
          _revision: string,
          path: string,
        ) =>
          path === `${root}/a`
            ? [node]
            : ['a', 'b'].map((name) => ({
                type: 'dir' as const,
                path: `${root}/${name}`,
                name,
                sha: null,
                content: null,
                size: null,
                downloadUrl: null,
              })),
      )
      const getRefSha = vi.fn(async () => 'a'.repeat(40))
      const api = {
        ...createGitHubApi(crypto.randomUUID(), vi.fn<typeof fetch>()),
        getDirectorySnapshot: undefined,
        getBranchHead: undefined,
        getRefSha,
        getDirectory,
        getFiles,
      }
      const schema: ContentSchema = {
        type: 'collection',
        name: 'posts',
        path: 'posts',
        ...(localized
          ? {
              i18n: {
                scheme: 'files',
                locales: ['en', 'fr'],
                path: { type: 'folder', position: 'root' },
              },
            }
          : {}),
      }
      normalizeContentI18n(schema, undefined)
      const input = {
        api,
        owner: 'o',
        repo: 'r',
        branch: 'main',
        path: 'posts',
        context: 'collection' as const,
        enabled: true,
        nodeFilename: 'index.md',
      }
      await createDirectoryCache({ database }).get({
        ...input,
        path: `${root}/a`,
        nodeFilename: undefined,
      })
      const read = () =>
        localizedDirectory(
          database,
          input,
          schema,
          localized ? 'fr' : undefined,
        )
      await expect(read()).resolves.toMatchObject({
        entries: expect.arrayContaining([node]),
      })
      await expect(read()).resolves.toMatchObject({
        entries: expect.arrayContaining([node]),
      })
      expect(getFiles.mock.calls[0]?.[3]).toEqual([`${root}/b/index.md`])
      getRefSha.mockResolvedValue('b'.repeat(40))
      await createDirectoryCache({ database }).refresh({
        ...input,
        path: root,
        nodeFilename: undefined,
      })
      await read()
      expect(getFiles.mock.calls.at(-1)).toEqual([
        'o',
        'r',
        'b'.repeat(40),
        [`${root}/a/index.md`, `${root}/b/index.md`],
        true,
        true,
      ])
    } finally {
      client.close()
    }
  },
)
