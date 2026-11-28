import { describe, expect, it } from 'vitest'
import { activityTarget } from './activity'

const configuration = {
  content: [
    {
      type: 'group',
      name: 'team',
      items: [
        { type: 'file', name: 'intro', path: 'posts/intro.md' },
        {
          type: 'collection',
          name: 'posts',
          path: 'posts',
          extension: 'md',
          exclude: ['private'],
        },
        {
          type: 'collection',
          name: 'flat',
          path: 'flat',
          extension: 'json',
          subfolders: false,
        },
      ],
    },
  ],
  media: [
    {
      name: 'images',
      input: 'public/images',
      output: '/images',
      extensions: ['png'],
    },
  ],
}

describe('configured activity paths', () => {
  it('matches fixed files, nested collections, media and configuration', () => {
    expect(activityTarget(configuration, 'posts/intro.md')).toEqual({
      area: 'file',
      resource: 'intro',
    })
    expect(activityTarget(configuration, 'posts/nested/entry.md')).toEqual({
      area: 'collection',
      resource: 'posts',
    })
    expect(activityTarget(configuration, 'public/images/photo.png')).toEqual({
      area: 'media',
      resource: 'images',
    })
    expect(activityTarget(null, '.pages.yml')?.area).toBe('configuration')
  })
  it.each([
    'posts2/entry.md',
    'posts/private/secret.md',
    'posts/entry.txt',
    'flat/sub/item.json',
    'public/images/photo.pdf',
    'posts/.gitkeep',
    'outside/file.md',
  ])('excludes unconfigured or excluded paths: %s', (path) =>
    expect(activityTarget(configuration, path)).toBeNull(),
  )
  it('does not treat a missing configuration as an invitation to track the whole repository', () => {
    expect(activityTarget(null, 'posts/a.md')).toBeNull()
  })
  it('tracks configured content even when custom navigation omits it', () => {
    expect(
      activityTarget(
        { ...configuration, navigation: { content: [] } },
        'posts/a.md',
      ),
    ).toEqual({ area: 'collection', resource: 'posts' })
  })
})
