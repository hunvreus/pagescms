import { describe, expect, it } from 'vitest'

import {
  filterConfigurationForDiscovery,
  getConfigurationActionNames,
} from './configuration-discovery'

describe('filterConfigurationForDiscovery', () => {
  it('removes undiscoverable schemas and actions from the client projection', () => {
    const configuration = {
      content: [
        {
          type: 'collection',
          name: 'posts',
          actions: [
            { name: 'publish', label: 'Publish', workflow: 'publish.yml' },
            { name: 'preview', label: 'Preview', workflow: 'preview.yml' },
          ],
        },
        { type: 'collection', name: 'drafts' },
        { type: 'file', name: 'settings' },
      ],
      media: [{ name: 'default' }, { name: 'private' }],
      actions: [
        { name: 'publish', label: 'Publish', workflow: 'publish.yml' },
        { name: 'preview', label: 'Preview', workflow: 'preview.yml' },
      ],
      navigation: {
        content: [
          {
            type: 'group',
            name: 'writing',
            items: [
              { type: 'collection', name: 'posts' },
              { type: 'collection', name: 'drafts' },
            ],
          },
        ],
        media: [
          { type: 'media', name: 'default' },
          { type: 'media', name: 'private' },
        ],
      },
    }

    expect(
      filterConfigurationForDiscovery(configuration, {
        visibility: 'filtered',
        resources: [
          { type: 'collection', name: 'posts' },
          { type: 'media', name: 'default' },
          { type: 'action', name: 'publish' },
        ],
      }),
    ).toEqual({
      content: [
        {
          type: 'collection',
          name: 'posts',
          actions: [
            { name: 'publish', label: 'Publish', workflow: 'publish.yml' },
          ],
        },
        { type: 'file', name: 'settings' },
      ],
      media: [{ name: 'default' }],
      actions: [{ name: 'publish', label: 'Publish', workflow: 'publish.yml' }],
      navigation: {
        content: [
          {
            type: 'group',
            name: 'writing',
            items: [{ type: 'collection', name: 'posts' }],
          },
        ],
        media: [{ type: 'media', name: 'default' }],
      },
    })

    expect(getConfigurationActionNames(configuration)).toEqual([
      'publish',
      'preview',
    ])
  })
})
