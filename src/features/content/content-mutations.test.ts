import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  confirmEntry,
  confirmContentWrite,
  hasPendingContentWrite,
  optimisticRows,
  removeEntryCache,
} from './content-mutations'
import { collectionViewModel } from '#/features/collections/collection-model'
import {
  collectionQueryOptions,
  entryQueryOptions,
  fixedFileQueryOptions,
} from '#/client/queries/content'
import type { ContentJob } from './content-mutations'
import type { getCollection } from '#/client/api/collections'
import type { readRawEntry as getRawEntry } from '#/server/services/content'

const coordinates = {
  owner: 'Owner',
  repo: 'Repo',
  branch: 'main',
  name: 'posts',
  path: 'posts/first.md',
}
const model = collectionViewModel({
  fields: [{ name: 'title', type: 'string' }],
  view: {},
})
type Row = Awaited<ReturnType<typeof getCollection>>['contents'][number]
const first: Row = {
  type: 'file',
  name: 'first.md',
  path: 'posts/first.md',
  parentPath: 'posts',
  sha: 'first-sha',
  isNode: true,
  fields: { title: 'First' },
}
const second: Row = {
  ...first,
  name: 'second.md',
  path: 'posts/second.md',
  sha: 'second-sha',
  fields: { title: 'Second' },
  isNode: false,
}
const job = (
  kind: ContentJob<unknown>['kind'],
  extra: Partial<ContentJob<unknown>> = {},
): ContentJob<unknown> => ({
  id: kind,
  coordinates,
  kind,
  title: 'Pending',
  run: async () => {},
  confirmed: () => {},
  ...extra,
})
describe('pending content rows', () => {
  it('rolls back only its overlay, preserving other confirmed changes', () => {
    const rows = [first, { ...second, fields: { title: 'Updated elsewhere' } }]
    expect(optimisticRows(rows, [job('delete')], 'posts', model)).toEqual([
      rows[1],
    ])
    expect(optimisticRows(rows, [], 'posts', model)).toEqual(rows)
    expect(rows[0]).toEqual(first)
  })
  it('keeps a rename at its real path until success', () => {
    const result = optimisticRows(
      [first],
      [
        job('rename', {
          filename: 'renamed.md',
          destination: 'posts/renamed.md',
        }),
      ],
      'posts',
      model,
    )
    expect(result[0]).toMatchObject({
      path: first.path,
      name: 'renamed.md',
      sha: 'first-sha',
      isNode: true,
    })
  })
  it('puts creations only in their directory and does not invent a real entry URL', () => {
    const pending = job('create', {
      parent: 'posts/nested',
      coordinates: { ...coordinates, path: undefined },
      fields: { title: 'Pending' },
    })
    expect(optimisticRows([first], [pending], 'posts', model)).toEqual([first])
    expect(
      optimisticRows([], [pending], 'posts/nested', model)[0],
    ).toMatchObject({
      path: '__creating__/create',
      sha: null,
      fields: { title: 'Pending' },
    })
  })
  it('updates save values while preserving node and path metadata', () => {
    expect(
      optimisticRows(
        [first, second],
        [job('save', { fields: { title: 'Changed' } })],
        'posts',
        model,
      )[0],
    ).toMatchObject({
      path: first.path,
      isNode: true,
      fields: { title: 'Changed' },
    })
  })
})
describe('confirmed content caches', () => {
  it('stores the complete server entry, preserves tree nodes, and does not touch other branches', () => {
    const client = new QueryClient()
    const collection = {
      collection: {
        i18n: null,
        locale: null,
        localized: false,
        path: 'posts',
        rootPath: 'posts',
        name: 'posts',
        label: 'Posts',
        allowCustomMessage: false,
        primaryField: 'title',
        groupTrail: [],
        format: 'yaml-frontmatter',
        extension: 'md',
        filename: null,
        subfolders: true,
        list: null,
        filenameField: false,
        view: {},
        operations: { create: true, rename: true, delete: true },
        actions: [],
        fields: [{ name: 'title', type: 'string' }],
      },
      contents: [first, second],
      errors: [],
      parseErrorPaths: [],
      media: [],
    } satisfies Awaited<ReturnType<typeof getCollection>>
    const key = collectionQueryOptions(coordinates).queryKey
    client.setQueryData(key, collection)
    const other = collectionQueryOptions({
      ...coordinates,
      branch: 'other',
    }).queryKey
    client.setQueryData(other, collection)
    const entry = {
      path: first.path,
      filename: first.name,
      sha: 'new-sha',
      schemaType: 'collection',
      i18n: null,
      localized: false,
      locale: null,
      translations: [],
      mode: 'structured',
      content: { title: 'Confirmed' },
      source: '---\ntitle: Confirmed\n---\n',
      schemaName: 'posts',
      label: 'Posts',
      allowCustomMessage: false,
      rootPath: 'posts',
      primaryField: 'title',
      groupTrail: [],
      actionContextType: 'entry',
      operations: { create: true, rename: true, delete: true },
      actions: [],
      fields: collection.collection.fields,
      media: [],
    } satisfies Awaited<ReturnType<typeof getRawEntry>>
    confirmEntry(client, coordinates, entry)
    expect(
      client.getQueryData(entryQueryOptions(coordinates).queryKey),
    ).toEqual(entry)
    expect(
      client.getQueryData<Awaited<ReturnType<typeof getCollection>>>(key)
        ?.contents[0],
    ).toMatchObject({
      sha: 'new-sha',
      isNode: true,
      fields: { title: 'Confirmed' },
    })
    expect(client.getQueryData(other)).toEqual(collection)
    confirmContentWrite(client, coordinates, { path: first.path })
    expect(
      client.getQueryData(entryQueryOptions(coordinates).queryKey),
    ).toBeUndefined()
    expect(client.getQueryData(other)).toEqual(collection)
    removeEntryCache(client, coordinates)
    expect(
      client.getQueryData(entryQueryOptions(coordinates).queryKey),
    ).toBeUndefined()
    expect(
      client.getQueryData<Awaited<ReturnType<typeof getCollection>>>(key)
        ?.contents,
    ).toEqual([second])
  })
})

it('reserves the physical file across aliases and rename destinations while a mutation runs', async () => {
  const client = new QueryClient()
  let resolve!: () => void
  const pending = client.getMutationCache().build(client, {
    mutationKey: ['pagescms', 'content-mutations'],
    mutationFn: () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  })
  const execution = pending.execute({
    ...job('rename', { destination: 'posts/renamed.md' }),
    account: 'editor',
  })
  await Promise.resolve()
  expect(
    hasPendingContentWrite(
      client,
      { ...coordinates, name: 'alias' },
      'another-draft',
      'editor',
    ),
  ).toBe(true)
  expect(
    hasPendingContentWrite(
      client,
      { ...coordinates, path: 'posts/renamed.md' },
      'another-draft',
      'editor',
    ),
  ).toBe(true)
  expect(
    hasPendingContentWrite(
      client,
      { ...coordinates, path: second.path },
      'another-draft',
      'editor',
      'posts/renamed.md',
    ),
  ).toBe(true)
  expect(
    hasPendingContentWrite(
      client,
      { ...coordinates, path: second.path },
      'another-draft',
      'editor',
      coordinates.path,
    ),
  ).toBe(true)
  expect(
    hasPendingContentWrite(
      client,
      { ...coordinates, path: second.path },
      'another-draft',
      'editor',
    ),
  ).toBe(false)
  expect(
    hasPendingContentWrite(
      client,
      { ...coordinates, branch: 'other' },
      'another-draft',
      'editor',
    ),
  ).toBe(false)
  expect(
    hasPendingContentWrite(
      client,
      coordinates,
      'another-draft',
      'other-account',
    ),
  ).toBe(false)
  resolve()
  await execution
  expect(
    hasPendingContentWrite(client, coordinates, 'another-draft', 'editor'),
  ).toBe(false)
})

describe('localized collection caches', () => {
  function collection(
    locale: string,
    scheme: 'files' | 'fields',
  ): Awaited<ReturnType<typeof getCollection>> {
    return {
      collection: {
        name: 'posts',
        label: 'Posts',
        path: 'posts',
        rootPath: 'posts',
        i18n: {
          scheme,
          default: 'en',
          locales: [
            { code: 'en', label: 'English' },
            { code: 'fr', label: 'French' },
          ],
          ...(scheme === 'files'
            ? {
                path: {
                  type: 'filename' as const,
                  position: 'suffix' as const,
                  separator: '.',
                  default: 'omit' as const,
                },
              }
            : {}),
        },
        locale,
        localized: false,
        allowCustomMessage: false,
        primaryField: 'title',
        groupTrail: [],
        format: 'json',
        extension: 'json',
        filename: null,
        subfolders: true,
        list: null,
        filenameField: false,
        fields: [{ name: 'title', type: 'string', localized: true }],
        view: {},
        operations: { create: true, rename: true, delete: true },
        actions: [],
      },
      contents: [],
      errors: [],
      parseErrorPaths: [],
      media: [],
    }
  }
  function entry(
    data: Awaited<ReturnType<typeof getCollection>>,
    path: string,
    content: { title: string | { en: string; fr: string } },
  ): Awaited<ReturnType<typeof getRawEntry>> {
    return {
      path,
      filename: path.split('/').at(-1)!,
      sha: 'saved-sha',
      mode: 'structured',
      schemaType: 'collection',
      schemaName: 'posts',
      rootPath: 'posts',
      label: 'Posts',
      i18n: data.collection.i18n,
      locale: 'fr',
      localized: false,
      translations: [],
      content,
      source: '{}',
      fields: data.collection.fields,
      allowCustomMessage: false,
      primaryField: 'title',
      groupTrail: [],
      actionContextType: 'entry',
      operations: { create: true, rename: true, delete: true },
      actions: [],
      media: [],
    }
  }
  it('projects a confirmed same-file save separately for every cached language', () => {
    const client = new QueryClient()
    const en = collection('en', 'fields'),
      fr = collection('fr', 'fields')
    const enKey = collectionQueryOptions({
      ...coordinates,
      locale: 'en',
    }).queryKey
    const frKey = collectionQueryOptions({
      ...coordinates,
      locale: 'fr',
    }).queryKey
    client.setQueryData(enKey, en)
    client.setQueryData(frKey, fr)
    confirmEntry(
      client,
      coordinates,
      entry(fr, 'posts/one.json', { title: { en: 'Hello', fr: 'Bonjour' } }),
    )
    expect(client.getQueryData<typeof en>(enKey)?.contents[0]).toMatchObject({
      fields: { title: 'Hello' },
    })
    expect(client.getQueryData<typeof fr>(frKey)?.contents[0]).toMatchObject({
      fields: { title: 'Bonjour' },
    })
  })
  it('does not insert a confirmed French file into an English collection', () => {
    const client = new QueryClient()
    const en = collection('en', 'files'),
      fr = collection('fr', 'files')
    const enKey = collectionQueryOptions({
      ...coordinates,
      locale: 'en',
    }).queryKey
    const frKey = collectionQueryOptions({
      ...coordinates,
      locale: 'fr',
    }).queryKey
    client.setQueryData(enKey, en)
    client.setQueryData(frKey, fr)
    confirmEntry(
      client,
      coordinates,
      entry(fr, 'posts/one.fr.json', { title: 'Bonjour' }),
    )
    expect(client.getQueryData<typeof en>(enKey)?.contents).toEqual([])
    expect(client.getQueryData<typeof fr>(frKey)?.contents[0]).toMatchObject({
      path: 'posts/one.fr.json',
      parentPath: 'posts',
      fields: { title: 'Bonjour' },
    })
  })
  it('projects pending same-file content and filters separate-file creations by language', () => {
    const en = collection('en', 'fields'),
      fr = collection('fr', 'fields')
    const save = job('save', {
      fields: { title: { en: 'Hello', fr: 'Bonjour' } },
    })
    expect(
      optimisticRows([first], [save], 'posts', model, fr.collection)[0],
    ).toMatchObject({ fields: { title: 'Bonjour' } })
    const create = job('create', {
      locale: 'fr',
      parent: 'posts',
      fields: { title: { fr: 'Bonjour' } },
    })
    expect(
      optimisticRows([], [create], 'posts', model, en.collection)[0],
    ).toMatchObject({ fields: {} })
    expect(
      optimisticRows(
        [],
        [create],
        'posts',
        model,
        collection('en', 'files').collection,
      ),
    ).toEqual([])
    expect(
      optimisticRows([], [create], 'posts', model, fr.collection)[0],
    ).toMatchObject({ fields: { title: 'Bonjour' } })
  })
  it('updates fixed-file locale aliases only when they refer to the saved physical file', () => {
    const client = new QueryClient()
    const data = collection('fr', 'files')
    const french = {
      ...entry(data, 'posts/one.fr.json', { title: 'Bonjour' }),
      schemaType: 'file' as const,
    }
    const english = {
      ...french,
      path: 'posts/one.json',
      locale: 'en',
      content: { title: 'Hello' },
    }
    const rootKey = fixedFileQueryOptions(coordinates).queryKey
    const enKey = fixedFileQueryOptions({
      ...coordinates,
      locale: 'en',
    }).queryKey
    const frKey = fixedFileQueryOptions({
      ...coordinates,
      locale: 'fr',
    }).queryKey
    client.setQueryData(rootKey, english)
    client.setQueryData(enKey, english)
    client.setQueryData(frKey, french)
    const saved = { ...french, content: { title: 'Salut' }, sha: 'updated' }
    confirmEntry(client, coordinates, saved)
    expect(client.getQueryData(rootKey)).toEqual(english)
    expect(client.getQueryData(enKey)).toEqual(english)
    expect(client.getQueryData(frKey)).toEqual(saved)
    confirmContentWrite(client, coordinates, { path: french.path })
    expect(client.getQueryData(frKey)).toBeUndefined()
    expect(client.getQueryData(enKey)).toBeUndefined()
  })
})
