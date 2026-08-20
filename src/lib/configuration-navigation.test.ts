import { describe, expect, it } from 'vitest'

import { getConfigurationNavigation } from './configuration-navigation'

describe('getConfigurationNavigation', () => {
  it('flattens content groups and media into route targets', () => {
    expect(
      getConfigurationNavigation({
        content: [
          {
            type: 'group',
            name: 'writing',
            items: [
              { type: 'collection', name: 'posts', label: 'Blog posts' },
              { type: 'file', name: 'home' },
            ],
          },
        ],
        media: [{ name: 'images', label: 'Images' }],
      }),
    ).toEqual([
      { type: 'collection', name: 'posts', label: 'Blog posts' },
      { type: 'file', name: 'home', label: 'home' },
      { type: 'media', name: 'images', label: 'Images' },
    ])
  })
})
