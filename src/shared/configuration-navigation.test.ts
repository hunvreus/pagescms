import { describe, expect, it } from 'vitest'

import {
  getConfigurationNavigation,
  getConfigurationNavigationGroupTrail,
  getConfigurationNavigationGroups,
} from '#/shared/configuration-navigation'

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

it('carries configured icons through normalization and grouped navigation', async () => {
  const { normalizeConfiguration } = await import('#/shared/configuration')
  const configuration = normalizeConfiguration({
    content: [
      {
        type: 'group',
        name: 'site',
        items: [
          {
            type: 'collection',
            name: 'posts',
            path: 'posts',
            icon: 'News01',
          },
          { type: 'file', name: 'home', path: 'home.md', icon: 'Home01' },
        ],
      },
    ],
  })
  expect(getConfigurationNavigation(configuration)).toEqual([
    { type: 'collection', name: 'posts', label: 'posts', icon: 'News01' },
    { type: 'file', name: 'home', label: 'home', icon: 'Home01' },
  ])
})

it.each(['object', 'array'])(
  'carries media icons through %s configuration and navigation',
  async (format) => {
    const { normalizeConfiguration } = await import('#/shared/configuration')
    const media = {
      name: 'images',
      label: 'Photos',
      input: 'public/images',
      output: '/images',
      icon: 'Camera01',
    }
    const configuration = normalizeConfiguration({
      media: format === 'array' ? [media] : media,
    })
    expect(configuration.media).toEqual([media])
    const expected = [
      { type: 'media', name: 'images', label: 'Photos', icon: 'Camera01' },
    ]
    expect(getConfigurationNavigationGroups(configuration).media).toEqual(
      expected,
    )
    expect(getConfigurationNavigationGroups({ media: [media] }).media).toEqual(
      expected,
    )
  },
)
