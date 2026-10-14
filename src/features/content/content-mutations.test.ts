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
import { collectionQueryOptions, entryQueryOptions } from '#/queries/content'
import type { ContentJob } from './content-mutations'
import type { getCollection } from '#/functions/collection'
import type { getRawEntry } from '#/functions/entry-editor'

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
