import { describe, expect, it } from 'vitest'

import {
  collectionDirectoryPath,
  findContentSchema,
} from './configuration-content'

const configuration = {
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
