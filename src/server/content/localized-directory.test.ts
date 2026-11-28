import { describe, it, expect, vi, beforeEach } from 'vitest'
import { localizedDirectory } from './localized-directory'
import { normalizeContentI18n } from '#/lib/i18n'
import type { ContentSchema } from '#/shared/configuration-content'
import type { Database } from '#/server/db/client'
import type {
  RepositoryApi,
  RepositoryDirectoryEntry,
} from '../repository/provider'

const directories = vi.hoisted(
  () => new Map<string, RepositoryDirectoryEntry[]>(),
)
vi.mock('#/server/cache/directory', () => ({
  createDirectoryCache: () => ({
    get: async ({ path }: { path: string }) => {
      return {
        entries: directories.get(path) ?? [],
      }
    },
  }),
}))
function file(path: string): RepositoryDirectoryEntry {
  return {
    path,
    name: path.split('/').at(-1)!,
    type: 'file',
    sha: 'sha',
    content: '{}',
    size: 2,
    downloadUrl: null,
  }
}
function dir(path: string): RepositoryDirectoryEntry {
  return {
    path,
    name: path.split('/').at(-1)!,
    type: 'dir',
    sha: null,
    content: null,
    size: null,
    downloadUrl: null,
  }
}
const input = {
  api: {} as RepositoryApi,
  owner: 'a',
  repo: 'b',
  branch: 'main',
  path: 'content/posts',
  context: 'collection' as const,
  enabled: true,
}
beforeEach(() => {
  directories.clear()
})

describe('locale directory discovery', () => {
  it('keeps canonical subfolders while reading parent-localized files', async () => {
    const schema: ContentSchema = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      i18n: {
        scheme: 'files',
        locales: ['en', 'fr'],
        path: { type: 'folder', position: 'parent', default: 'omit' },
      },
    }
    normalizeContentI18n(schema, undefined)
    directories.set('content/posts', [
      file('content/posts/a.md'),
      dir('content/posts/fr'),
      dir('content/posts/guides'),
    ])
    directories.set('content/posts/fr', [file('content/posts/fr/a.md')])
    const fr = await localizedDirectory({} as Database, input, schema, 'fr')
    expect(fr.entries.map((item) => item.path)).toEqual([
      'content/posts/fr/a.md',
      'content/posts/guides',
    ])
    const en = await localizedDirectory({} as Database, input, schema, 'en')
    expect(en.entries.map((item) => item.path)).toEqual([
      'content/posts/a.md',
      'content/posts/guides',
    ])
  })
  it.each(['root', 'collection', 'custom'])(
    'returns canonical subfolder paths for %s placement',
    async (position) => {
      const schema: ContentSchema = {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        i18n: {
          scheme: 'files',
          locales: ['en', 'fr'],
          path: {
            type: 'folder',
            position,
            ...(position === 'custom' ? { after: 'content' } : {}),
          },
        },
      }
      normalizeContentI18n(schema, undefined)
      const physical =
        position === 'root'
          ? 'fr/content/posts'
          : position === 'custom'
            ? 'content/fr/posts'
            : 'content/posts/fr'
      directories.set(physical, [
        file(`${physical}/a.md`),
        dir(`${physical}/guides`),
      ])
      const result = await localizedDirectory(
        {} as Database,
        input,
        schema,
        'fr',
      )
      expect(result.entries.map((item) => item.path)).toEqual([
        `${physical}/a.md`,
        'content/posts/guides',
      ])
    },
  )
  it('filters filename locales while preserving folders', async () => {
    const schema: ContentSchema = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      i18n: {
        scheme: 'files',
        locales: ['en', 'fr'],
        path: { type: 'filename', position: 'suffix', default: 'omit' },
      },
    }
    normalizeContentI18n(schema, undefined)
    directories.set(input.path, [
      file('content/posts/a.md'),
      file('content/posts/a.fr.md'),
      dir('content/posts/guides'),
    ])
    const result = await localizedDirectory({} as Database, input, schema, 'fr')
    expect(result.entries.map((item) => item.path)).toEqual([
      'content/posts/a.fr.md',
      'content/posts/guides',
    ])
  })
})

it.each([
  undefined,
  { scheme: 'fields', locales: ['en', 'fr'] },
  {
    scheme: 'files',
    locales: ['en', 'fr'],
    path: { type: 'folder', position: 'parent' },
  },
])(
  'rejects wildcard requests for the collection configuration %j',
  async (i18n) => {
    const schema: ContentSchema = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      format: 'json',
      i18n,
    }
    normalizeContentI18n(schema, undefined)
    await expect(
      localizedDirectory({} as Database, input, schema, '*'),
    ).rejects.toThrow('Unknown content locale')
  },
)

it('still lists an unlocalized collection opened with a language code', async () => {
  directories.set(input.path, [file(input.path + '/one.md')])
  const schema: ContentSchema = {
    name: 'posts',
    type: 'collection',
    path: input.path,
  }
  const result = await localizedDirectory({} as Database, input, schema, 'en')
  expect(result.entries.map((entry) => entry.path)).toEqual([
    input.path + '/one.md',
  ])
})
