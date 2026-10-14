import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  mediaRows,
  patchMedia,
  mediaParent,
  refreshMedia,
} from './media-mutations'
import { mediaQueryOptions, mediaDeliveryQueryOptions } from '#/queries/content'
import type { MediaJob } from './media-mutations'
import type { MediaDirectoryData, MediaEntry } from './media-model'

const coordinates = {
  owner: 'Owner',
  repo: 'Repo',
  branch: 'main',
  name: 'media',
}
const first: MediaEntry = {
  id: 'first',
  path: 'images/first.png',
  name: 'first.png',
  type: 'file',
  sha: 'v1',
  size: 1,
  contentType: 'image/png',
}
const second: MediaEntry = {
  ...first,
  id: 'second',
  path: 'images/second.png',
  name: 'second.png',
  sha: 'v2',
}
const job = (
  kind: MediaJob['kind'],
  extra: Partial<MediaJob> = {},
): MediaJob => ({
  id: kind,
  coordinates,
  kind,
  directory: 'images',
  paths: [first.path],
  run: async () => {},
  ...extra,
})
function directory(path: string, entries: MediaEntry[]): MediaDirectoryData {
  return {
    media: {
      name: 'media',
      label: 'Media',
      path,
      rootPath: 'images',
      output: null,
      extensions: [],
      actions: [],
      provider: 'test',
      capabilities: {
        upload: true,
        directUpload: false,
        createDirectory: true,
        move: true,
        rename: true,
        remove: true,
      },
    },
    entries,
  }
}
describe('pending media overlays', () => {
  it('rolls back only the failed deletion and preserves other confirmed changes', () => {
    const rows = [first, { ...second, name: 'changed.png' }]
    expect(
      mediaRows(rows, [job('delete', { entry: first })], 'images', {}),
    ).toEqual([rows[1]])
    expect(mediaRows(rows, [], 'images', {})).toEqual(rows)
    expect(rows[0]).toEqual(first)
  })
  it('shows a rename at its confirmed path until completion', () => {
    expect(
      mediaRows(
        [first],
        [job('rename', { entry: first, filename: 'new.png' })],
        'images',
        {},
      )[0],
    ).toMatchObject({ path: first.path, name: 'new.png', sha: 'v1' })
  })
  it('removes a pending move only from its source directory', () => {
    const pending = job('move', {
      entry: first,
      destination: 'images/folder/first.png',
    })
    expect(mediaRows([first, second], [pending], 'images', {})).toEqual([
      second,
    ])
    expect(mediaRows([], [pending], 'images/folder', {})).toEqual([])
  })
  it('shows uploads without a usable path and hides each completed file immediately', () => {
    const files = [
      new File(['first'], 'first.png'),
      new File(['second'], 'second.png'),
    ]
    const upload = job('upload', { files })
    const pending = mediaRows([], [upload], 'images', { upload: [0] })
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      path: '__pending__/upload/1',
      name: 'second.png',
      sha: null,
    })
    expect(mediaRows([], [upload], 'images/folder', {})).toEqual([])
  })
  it('does not duplicate a confirmed directory during acknowledgement', () => {
    const folder: MediaEntry = {
      ...first,
      id: 'folder',
      name: 'folder',
      path: 'images/folder',
      type: 'dir',
      sha: null,
    }
    expect(
      mediaRows(
        [folder],
        [job('folder', { filename: 'folder', destination: folder.path })],
        'images',
        {},
      ),
    ).toEqual([folder])
  })
})
describe('confirmed media cache updates', () => {
  it('patches source and destination without replacing other rows or branches', () => {
    const client = new QueryClient()
    const sourceKey = mediaQueryOptions({
      ...coordinates,
      path: 'images',
    }).queryKey
    const targetKey = mediaQueryOptions({
      ...coordinates,
      path: 'images/folder',
    }).queryKey
    const otherKey = mediaQueryOptions({
      ...coordinates,
      branch: 'other',
      path: 'images',
    }).queryKey
    client.setQueryData(sourceKey, directory('images', [first, second]))
    client.setQueryData(targetKey, directory('images/folder', []))
    client.setQueryData(otherKey, directory('images', [first]))
    const moved = {
      ...first,
      path: 'images/folder/first.png',
      sha: 'new-version',
    }
    patchMedia(client, coordinates, [first.path], moved)
    expect(client.getQueryData(sourceKey)?.entries).toEqual([second])
    expect(client.getQueryData(targetKey)?.entries).toEqual([moved])
    expect(client.getQueryData(otherKey)?.entries).toEqual([first])
    expect(mediaParent(moved.path)).toBe('images/folder')
  })
})

it('refreshes a first directory read that started before an upload or move committed', async () => {
  const client = new QueryClient()
  const options = mediaQueryOptions({ ...coordinates, path: 'images/folder' })
  let finish!: (value: MediaDirectoryData) => void
  const held = new Promise<MediaDirectoryData>((resolve) => {
    finish = resolve
  })
  const initialRead = client.fetchQuery({ ...options, queryFn: () => held })
  refreshMedia(client, coordinates, ['images/folder'])
  finish(directory('images/folder', []))
  await initialRead
  await vi.waitFor(() =>
    expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(true),
  )
  client.clear()
})

it('refreshes preview leases only in the directories affected by a media operation', () => {
  const client = new QueryClient()
  const root = mediaQueryOptions(coordinates).queryKey
  const nested = mediaQueryOptions({
    ...coordinates,
    path: 'images/folder',
  }).queryKey
  client.setQueryData(root, directory('images', [first]))
  client.setQueryData(nested, directory('images/folder', []))
  const rootDelivery = mediaDeliveryQueryOptions({
    ...coordinates,
    paths: [first.path],
  }).queryKey
  const nestedDelivery = mediaDeliveryQueryOptions({
    ...coordinates,
    path: 'images/folder',
    paths: ['images/folder/other.png'],
  }).queryKey
  client.setQueryData(rootDelivery, {
    provider: 'test',
    delivery: 'private',
    leases: [],
    errors: [],
  })
  client.setQueryData(nestedDelivery, {
    provider: 'test',
    delivery: 'private',
    leases: [],
    errors: [],
  })
  refreshMedia(client, coordinates, ['images'])
  expect(client.getQueryState(rootDelivery)?.isInvalidated).toBe(true)
  expect(client.getQueryState(nestedDelivery)?.isInvalidated).toBe(false)
  client.clear()
})
