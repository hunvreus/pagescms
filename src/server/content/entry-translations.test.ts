import { createGitHubApi } from '#/server/github/api'
import { beforeEach, expect, it, vi } from 'vitest'
import { normalizeContentI18n, localizedPath } from '#/lib/i18n'
import { loadEntryTranslations } from './entry-editor'
import type { ContentSchema } from '#/shared/configuration-content'
import type { Database } from '#/server/db/client'

const configuration = vi.hoisted(() => ({
  object: { content: [] as ContentSchema[] },
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({ get: async () => configuration }),
}))
const schema: ContentSchema = {
  name: 'posts',
  type: 'collection',
  path: 'posts',
  extension: 'md',
  i18n: {
    scheme: 'files',
    locales: ['en', 'fr', 'de'],
    path: { type: 'folder', position: 'root' },
  },
}
normalizeContentI18n(schema, undefined)
const paths = ['en', 'fr', 'de'].map((locale) =>
  localizedPath(schema, 'posts/a.md', locale),
)
const getFile = vi.fn()
const getFiles = vi.fn()
const getRefSha = vi.fn(async () => 'a'.repeat(40))
const api = {
  ...createGitHubApi('test', vi.fn<typeof fetch>()),
  getFile,
  getFiles,
  getRefSha,
}
const input = {
  database: {} as Database,
  repositoryAccess: {
    resolve: async () => ({ api, tokenSource: 'user' as const }),
  },
  user: {
    id: 'u',
    name: 'Editor',
    email: 'u@example.test',
    githubUsername: null,
  },
  owner: 'o',
  repo: 'r',
  branch: 'main',
  name: 'posts',
  path: paths[0],
}
beforeEach(() => {
  configuration.object.content = [schema]
  getFiles.mockReset().mockResolvedValue([
    { type: 'file', path: paths[0], sha: 'english' },
    { type: 'file', path: paths[2], sha: 'german' },
  ])
  getFile.mockClear()
  getRefSha.mockClear()
})
it('checks every locale before one metadata-only read at a pinned revision, retaining missing locales and order', async () => {
  const checked: string[] = []
  getFiles.mockImplementationOnce(async () => {
    expect(checked).toEqual(paths)
    return [
      { type: 'file', path: paths[2], sha: 'german' },
      { type: 'file', path: paths[0], sha: 'english' },
    ]
  })
  const result = await loadEntryTranslations({
    ...input,
    authorizeRead: async (path) => {
      checked.push(path)
    },
  })
  expect(
    result.map(({ path, exists, sha }) => ({ path, exists, sha })),
  ).toEqual([
    { path: paths[0], exists: true, sha: 'english' },
    { path: paths[1], exists: false, sha: null },
    { path: paths[2], exists: true, sha: 'german' },
  ])
  expect(getRefSha).toHaveBeenCalledTimes(1)
  expect(getFiles).toHaveBeenCalledExactlyOnceWith(
    'o',
    'r',
    'a'.repeat(40),
    paths,
    false,
  )
  expect(getFile).not.toHaveBeenCalled()
})
it('never performs the batch read if a locale is denied', async () => {
  await expect(
    loadEntryTranslations({
      ...input,
      authorizeRead: async (path) => {
        if (path === paths[1]) throw new Error('Denied')
      },
    }),
  ).rejects.toThrow('Denied')
  expect(getFiles).not.toHaveBeenCalled()
})
it('propagates provider failures instead of reporting every translation missing', async () => {
  getFiles.mockRejectedValueOnce(new Error('Provider unavailable'))
  await expect(loadEntryTranslations(input)).rejects.toThrow(
    'Provider unavailable',
  )
})
