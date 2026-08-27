import { describe, expect, it } from 'vitest'

import {
  getConfigurationNavigation,
  getConfigurationNavigationGroupTrail,
  getConfigurationNavigationGroups,
  getDefaultConfigurationNavigationItem,
} from './configuration-navigation'

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

  it('preserves normalized groups for repository navigation', () => {
    const configuration = {
      content: [{ type: 'collection', name: 'posts' }],
      navigation: {
        content: [
          {
            type: 'group',
            name: 'writing',
            label: 'Writing',
            items: [{ type: 'collection', name: 'posts', label: 'Blog posts' }],
          },
        ],
      },
    }

    expect(getConfigurationNavigationGroups(configuration).content).toEqual([
      {
        type: 'group',
        name: 'writing',
        label: 'Writing',
        items: [{ type: 'collection', name: 'posts', label: 'Blog posts' }],
      },
    ])
  })

  it('selects the first navigable item as the repository default', () => {
    expect(
      getDefaultConfigurationNavigationItem({
        navigation: {
          content: [
            {
              type: 'group',
              name: 'writing',
              items: [{ type: 'file', name: 'home', label: 'Home' }],
            },
          ],
          media: [{ type: 'media', name: 'images', label: 'Images' }],
        },
      }),
    ).toEqual({ type: 'file', name: 'home', label: 'Home' })
  })

  it('returns the nested navigation groups containing a collection', () => {
    expect(
      getConfigurationNavigationGroupTrail(
        {
          navigation: {
            content: [
              {
                type: 'group',
                name: 'publishing',
                label: 'Publishing',
                items: [
                  {
                    type: 'group',
                    name: 'website',
                    items: [{ type: 'collection', name: 'posts' }],
                  },
                ],
              },
            ],
          },
        },
        'posts',
      ),
    ).toEqual([
      { name: 'publishing', label: 'Publishing' },
      { name: 'website', label: 'website' },
    ])
  })

  it('falls back to groups in the content configuration', () => {
    expect(
      getConfigurationNavigationGroupTrail(
        {
          content: [
            {
              type: 'group',
              name: 'writing',
              items: [{ type: 'collection', name: 'posts' }],
            },
          ],
        },
        'posts',
      ),
    ).toEqual([{ name: 'writing', label: 'writing' }])
  })
})
