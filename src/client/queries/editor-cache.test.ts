import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import { fileHistoryQueryOptions } from './file-history'
import {
  referenceOptionsQueryOptions,
  referenceSearchPlaceholder,
  selectedReferencesQueryOptions,
} from './references'
import { entryTranslationsQueryOptions } from './content'
import { refreshContent } from '#/features/content/content-mutations'
import type * as entryClient from '#/client/api/entries'
import type * as configurationClient from '#/client/api/configuration'

const calls = vi.hoisted(() => ({
  history: vi.fn(),
  configuration: vi.fn(),
  references: vi.fn(),
  translations: vi.fn(),
}))
vi.mock('#/client/api/entries', async (original) => ({
  ...(await original<typeof entryClient>()),
  getEntryHistory: calls.history,
  readTranslations: calls.translations,
}))
vi.mock('#/client/api/configuration', async (original) => ({
  ...(await original<typeof configurationClient>()),
  getConfigurationHistory: calls.configuration,
}))
vi.mock('#/client/api/reference', () => ({
  readReferenceOptions: calls.references,
}))
const repository = {
  owner: 'pagescms',
  repo: 'Test',
  repoId: '42',
  source: 'github.com',
  branch: 'main',
}
const file = { ...repository, name: 'posts', path: 'posts/a.md' }
const reference = {
  ...repository,
  collection: 'posts',
  valueTemplate: '{path}',
  labelTemplate: '{title}',
  searchFields: ['title'],
}
const client = new QueryClient()
beforeEach(() => vi.resetAllMocks())
afterEach(() => client.clear())

describe('editor query caches', () => {
  it('retains loaded history pages across observers and retries the same failed page', async () => {
    calls.history.mockImplementation((data: { page: number }) =>
      Promise.resolve(
        Array.from({ length: data.page < 3 ? 10 : 3 }, (_, index) => ({
          sha: `${data.page}-${index}`,
        })),
      ),
    )
    const options = fileHistoryQueryOptions(file, 'alice')
    await client.fetchInfiniteQuery(options)
    const observer = new InfiniteQueryObserver(client, options)
    await observer.fetchNextPage()
    expect(client.getQueryData(options.queryKey)?.pages).toHaveLength(2)
    await client.fetchInfiniteQuery(options)
    expect(calls.history).toHaveBeenCalledTimes(2)
    calls.history.mockRejectedValueOnce(new Error('Offline'))
    const failed = await observer.fetchNextPage()
    expect(failed.isFetchNextPageError).toBe(true)
    expect(failed.data?.pages).toHaveLength(2)
    await observer.fetchNextPage()
    expect(
      calls.history.mock.calls.slice(-2).map(([request]) => request.page),
    ).toEqual([3, 3])
    expect(client.getQueryData(options.queryKey)?.pages.flat()).toHaveLength(23)
    observer.destroy()
  })

  it('separates history by account, provider, repository, branch, path and resource', () => {
    const key = fileHistoryQueryOptions(file, 'alice').queryKey
    for (const changed of [
      fileHistoryQueryOptions(file, 'bob'),
      fileHistoryQueryOptions({ ...file, source: 'github.example' }, 'alice'),
      fileHistoryQueryOptions({ ...file, repoId: '43' }, 'alice'),
      fileHistoryQueryOptions({ ...file, branch: 'preview' }, 'alice'),
      fileHistoryQueryOptions({ ...file, path: 'posts/b.md' }, 'alice'),
      fileHistoryQueryOptions({ ...file, name: 'other' }, 'alice'),
      fileHistoryQueryOptions({ ...file, configuration: true }, 'alice'),
    ])
      expect(changed.queryKey).not.toEqual(key)
    expect(
      fileHistoryQueryOptions(
        { ...file, owner: 'renamed', repo: 'new' },
        'alice',
      ).queryKey,
    ).toEqual(key)
  })

  it('loads configuration history through its own endpoint', async () => {
    calls.configuration.mockResolvedValue([])
    await client.fetchInfiniteQuery(
      fileHistoryQueryOptions(
        {
          ...file,
          name: 'Configuration',
          path: '.pages.yml',
          configuration: true,
        },
        'alice',
      ),
    )
    expect(calls.configuration).toHaveBeenCalledOnce()
    expect(calls.history).not.toHaveBeenCalled()
  })

  it('reuses reference pages and selected labels, and refreshes them after collection invalidation', async () => {
    calls.references.mockImplementation((data: { cursor?: string }) =>
      Promise.resolve({
        options: [
          {
            value: data.cursor ? 'b' : 'a',
            label: data.cursor ? 'Second' : 'First',
          },
        ],
        cursor: data.cursor ? undefined : 'next',
      }),
    )
    const options = referenceOptionsQueryOptions(
      { ...reference, query: '' },
      'alice',
    )
    await client.fetchInfiniteQuery(options)
    const observer = new InfiniteQueryObserver(client, options)
    await observer.fetchNextPage()
    observer.destroy()
    await client.fetchInfiniteQuery(options)
    expect(calls.references).toHaveBeenCalledTimes(2)
    const selected = selectedReferencesQueryOptions(
      { ...reference, selectedValues: ['b', 'a'] },
      'alice',
    )
    expect(await client.fetchQuery(selected)).toEqual([
      { value: 'a', label: 'First' },
      { value: 'b', label: 'Second' },
    ])
    await client.fetchQuery(
      selectedReferencesQueryOptions(
        { ...reference, selectedValues: ['a', 'b', 'a'] },
        'alice',
      ),
    )
    expect(calls.references).toHaveBeenCalledTimes(4)
    const subset = selectedReferencesQueryOptions(
      { ...reference, selectedValues: ['a'] },
      'alice',
    )
    expect(await client.fetchQuery(subset)).toEqual([
      { value: 'a', label: 'First' },
    ])
    expect(calls.references).toHaveBeenCalledTimes(4)
    const history = fileHistoryQueryOptions(file, 'alice')
    client.setQueryData(history.queryKey, { pages: [[]], pageParams: [1] })
    const other = selectedReferencesQueryOptions(
      { ...reference, collection: 'other', selectedValues: ['a'] },
      'alice',
    )
    client.setQueryData(other.queryKey, [])
    refreshContent(client, file)
    expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(selected.queryKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(history.queryKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(other.queryKey)?.isInvalidated).toBe(false)
    await client.fetchQuery(selected)
    expect(calls.references).toHaveBeenCalledTimes(6)
  })

  it('shares warm translation availability across menu openings, scopes it to the account and refreshes after writes', async () => {
    calls.translations.mockResolvedValue([
      {
        code: 'en',
        label: 'English',
        path: file.path,
        exists: true,
        sha: 'sha',
      },
    ])
    const options = entryTranslationsQueryOptions(file, 'alice')
    await client.fetchQuery(options)
    await client.fetchQuery(options)
    expect(calls.translations).toHaveBeenCalledOnce()
    const bob = entryTranslationsQueryOptions(file, 'bob')
    expect(bob.queryKey).not.toEqual(options.queryKey)
    expect(entryTranslationsQueryOptions(file).enabled).toBe(false)
    refreshContent(client, file)
    expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(true)
    await client.fetchQuery(options)
    expect(calls.translations).toHaveBeenCalledTimes(2)
  })

  it('does not mix reference settings or accounts, and only carries search placeholders within the same scope', () => {
    const first = referenceOptionsQueryOptions(
      { ...reference, query: '' },
      'alice',
    )
    const search = referenceOptionsQueryOptions(
      { ...reference, query: 'next' },
      'alice',
    )
    const data = {
      pages: [{ options: [{ value: 'a', label: 'First' }] }],
      pageParams: [undefined],
    }
    expect(
      referenceSearchPlaceholder(data, first.queryKey, search.queryKey),
    ).toEqual(data)
    for (const changed of [
      referenceOptionsQueryOptions({ ...reference, query: '' }, 'bob'),
      referenceOptionsQueryOptions(
        { ...reference, query: '', branch: 'preview' },
        'alice',
      ),
      referenceOptionsQueryOptions(
        { ...reference, query: '', repoId: '43' },
        'alice',
      ),
      referenceOptionsQueryOptions(
        { ...reference, query: '', source: 'other.example' },
        'alice',
      ),
      referenceOptionsQueryOptions(
        { ...reference, query: '', collection: 'other' },
        'alice',
      ),
      referenceOptionsQueryOptions(
        { ...reference, query: '', labelTemplate: '{name}' },
        'alice',
      ),
      referenceOptionsQueryOptions(
        { ...reference, query: '', valueTemplate: '{slug}' },
        'alice',
      ),
      referenceOptionsQueryOptions(
        { ...reference, query: '', searchFields: ['body'] },
        'alice',
      ),
    ]) {
      expect(changed.queryKey).not.toEqual(first.queryKey)
      expect(
        referenceSearchPlaceholder(data, first.queryKey, changed.queryKey),
      ).toBeUndefined()
    }
  })
})
