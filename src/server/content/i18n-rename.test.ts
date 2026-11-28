import { beforeEach, describe, it, expect, vi } from 'vitest'
import { normalizeConfiguration } from '#/shared/configuration'
import { RepositoryProviderError } from '../repository/provider'
import {
  createContentFolder,
  loadEntryTranslations,
  planContentRename,
  renameContentEntry,
} from './entry-editor'
import type { RepositoryApi } from '../repository/provider'
import type { Database } from '#/server/db/client'

const state = vi.hoisted(() => ({
  configuration: {},
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({
    get: async () => ({ object: state.configuration }),
  }),
}))
vi.mock('#/server/cache/repository', () => ({
  updateRepositoryCacheAfterMutation: vi.fn(),
}))
beforeEach(() => {
  state.configuration = normalizeConfiguration({
    i18n: { locales: ['en', 'fr', 'ar'], default: 'en' },
    content: [
      {
        name: 'posts',
        type: 'collection',
        path: '',
        fields: [{ name: 'title', type: 'string' }],
        format: 'json',
        extension: 'json',
        i18n: {
          scheme: 'files',
          path: { type: 'filename', position: 'suffix', default: 'omit' },
        },
      },
    ],
  })
})
function setup() {
  const files = new Map([
    ['about.json', 'en-sha'],
    ['about.fr.json', 'fr-sha'],
  ])
  const getRefSha = vi.fn(async () => 'head')
  const renameFile = vi.fn(
    async (input: Parameters<RepositoryApi['renameFile']>[0]) => ({
      ...input,
      commitSha: 'commit',
      parentCommitSha: 'head',
    }),
  )
  const api = {
    getRefSha,
    renameFile,
    putFile: vi.fn(),
    getFile: vi.fn(async (_owner: string, _repo: string, path: string) => {
      const sha = files.get(path)
      if (!sha) throw new RepositoryProviderError('Missing', 404)
      return { sha, content: 'e30=' }
    }),
  }
  const input = {
    database: {} as Database,
    repositoryAccess: {
      resolve: vi.fn().mockResolvedValue({ api, tokenSource: 'installation' }),
    },
    user: {
      id: 'editor',
      name: 'Editor',
      email: 'editor@example.com',
      githubUsername: null,
    },
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    name: 'posts',
    path: 'about.json',
    sha: 'en-sha',
    filename: 'contact.json',
  }
  return { files, input, api }
}
describe('translation rename plans', () => {
  it('previews existing siblings at the repository root and renames atomically', async () => {
    const { input, api } = setup()
    const moves = await planContentRename(input)
    expect(moves).toEqual([
      {
        path: 'about.json',
        newPath: 'contact.json',
        sha: 'en-sha',
        revision: 'head',
      },
      {
        path: 'about.fr.json',
        newPath: 'contact.fr.json',
        sha: 'fr-sha',
        revision: 'head',
      },
    ])
    const authorizeMove = vi.fn(async () => undefined)
    await renameContentEntry({ ...input, confirmedMoves: moves, authorizeMove })
    expect(authorizeMove.mock.calls).toHaveLength(2)
    expect(api.renameFile).toHaveBeenCalledOnce()
    expect(api.renameFile).toHaveBeenCalledWith(
      expect.objectContaining({ moves, expectedHead: 'head' }),
    )
  })
  it('accepts confirmed moves with a different property order and loads context once', async () => {
    const { input, api } = setup()
    const moves = await planContentRename(input)
    input.repositoryAccess.resolve.mockClear()
    const confirmedMoves = moves.map(({ path, newPath, sha, revision }) => ({
      revision,
      sha,
      newPath,
      path,
    }))
    await renameContentEntry({ ...input, confirmedMoves })
    expect(api.renameFile).toHaveBeenCalledOnce()
    expect(input.repositoryAccess.resolve).toHaveBeenCalledOnce()
  })

  it('does not move files without a confirmed current plan', async () => {
    const { input, api, files } = setup()
    await expect(renameContentEntry(input)).rejects.toThrow(/confirm/)
    const confirmedMoves = await planContentRename(input)
    files.set('about.ar.json', 'new-translation')
    await expect(
      renameContentEntry({ ...input, confirmedMoves }),
    ).rejects.toThrow(/confirm/)
    expect(api.renameFile).not.toHaveBeenCalled()
  })
  it('rejects a changed branch even if sibling contents are unchanged', async () => {
    const { input, api } = setup()
    const confirmedMoves = await planContentRename(input)
    api.getRefSha.mockResolvedValue('head-2')
    await expect(
      renameContentEntry({ ...input, confirmedMoves }),
    ).rejects.toThrow(/confirm/)
    expect(api.renameFile).not.toHaveBeenCalled()
  })
})

it('authorizes each sibling before reading its existence or SHA', async () => {
  const { input, api } = setup()
  const authorizeRead = vi.fn(async (path: string) => {
    if (path === 'about.fr.json') throw new Error('Read denied')
  })
  await expect(
    loadEntryTranslations({ ...input, authorizeRead }),
  ).rejects.toThrow('Read denied')
  expect(authorizeRead).toHaveBeenCalledWith('about.fr.json')
  expect(
    api.getFile.mock.calls.some((call) => call[2] === 'about.fr.json'),
  ).toBe(false)
})

it.each(['en', 'fr'])(
  'rejects a reserved folder name before writing in %s',
  async (locale) => {
    const { input, api } = setup()
    state.configuration = normalizeConfiguration({
      i18n: { locales: ['en', 'fr'], default: 'en' },
      content: [
        {
          name: 'posts',
          type: 'collection',
          path: '',
          format: 'json',
          fields: [{ name: 'title', type: 'string' }],
          i18n: {
            scheme: 'files',
            path: { type: 'folder', position: 'collection', default: 'omit' },
          },
        },
      ],
    })
    const authorizeWrite = vi.fn(async () => undefined)
    await expect(
      createContentFolder({
        ...input,
        parent: '',
        folder: 'fr',
        locale,
        authorizeWrite,
      }),
    ).rejects.toThrow(/reserved locale name/)
    expect(authorizeWrite).not.toHaveBeenCalled()
    expect(api.putFile).not.toHaveBeenCalled()
  },
)

it('rejects an empty folder name without creating a marker file', async () => {
  const { input, api } = setup()
  state.configuration = normalizeConfiguration({
    content: [
      { name: 'posts', type: 'collection', path: 'content/posts', fields: [] },
    ],
  })
  api.putFile.mockResolvedValue({ sha: 'sha', commitSha: 'commit' })
  await expect(
    createContentFolder({ ...input, parent: 'content/posts', folder: '' }),
  ).rejects.toThrow('Folder name is invalid')
  expect(api.putFile).not.toHaveBeenCalled()
})
