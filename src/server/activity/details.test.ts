import { expect, it } from 'vitest'
import { activityTitles } from '#/server/activity/details'
import type { Database } from '#/server/db/client'
import type { ActivityItem } from '#/lib/activity'

it('repairs previously stringified activity titles from cached localized content', async () => {
  const database = {
    $client: {
      execute: async () => ({
        rows: [
          {
            path: 'posts/hello.json',
            content: JSON.stringify({ title: { en: 'Hello', fr: 'Bonjour' } }),
          },
        ],
      }),
    },
  } as unknown as Database
  const configuration = {
    content: [
      {
        name: 'posts',
        type: 'collection',
        path: 'posts',
        format: 'json',
        fields: [{ name: 'title', type: 'string', localized: true }],
        i18n: {
          scheme: 'fields',
          default: 'en',
          locales: [{ code: 'en', label: 'English' }],
        },
      },
    ],
  }
  const item = {
    area: 'collection',
    resource: 'posts',
    path: 'posts/hello.json',
    title: '[object Object]',
  } as ActivityItem
  const result = await activityTitles(
    database,
    configuration,
    { owner: 'test', repo: 'test', branch: 'main' },
    [
      item,
      { ...item, path: 'posts/missing.json' },
      { ...item, title: 'Original title' },
    ],
  )
  expect(result.map((event) => event.title)).toEqual([
    'Hello',
    'missing.json',
    'Original title',
  ])
})
