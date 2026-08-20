import { describe, expect, it } from 'vitest'

import {
  collectionDirectoryPath,
  findContentSchema,
  findMediaSchema,
  mediaDirectoryPath,
} from './configuration-content'

const configuration = {
  media: [{ name: 'images', input: 'public/images', output: '/images' }],
  content: [
    {
      type: 'group',
      name: 'writing',
      items: [
        {
          type: 'collection',
          name: 'posts',
          path: 'content/posts',
          subfolders: true,
        },
      ],
    },
  ],
}

describe('findContentSchema', () => {
  it('finds nested collection schemas', () => {
    expect(findContentSchema(configuration, 'posts')).toMatchObject({
      type: 'collection',
      path: 'content/posts',
    })
  })
})

describe('media schemas', () => {
  it('finds media and confines directories to its input root', () => {
    const schema = findMediaSchema(configuration, 'images')!
    expect(mediaDirectoryPath(schema)).toBe('public/images')
    expect(mediaDirectoryPath(schema, 'public/images/posts')).toBe(
      'public/images/posts',
    )
    expect(() => mediaDirectoryPath(schema, 'public/private')).toThrow(
      'outside',
    )
  })
})

describe('collectionDirectoryPath', () => {
  it('allows the root and descendants but rejects sibling prefixes', () => {
    const schema = findContentSchema(configuration, 'posts')!
    expect(collectionDirectoryPath(schema)).toBe('content/posts')
    expect(collectionDirectoryPath(schema, 'content/posts/archive')).toBe(
      'content/posts/archive',
    )
    expect(() =>
      collectionDirectoryPath(schema, 'content/posts-private'),
    ).toThrow('outside')
  })
})
