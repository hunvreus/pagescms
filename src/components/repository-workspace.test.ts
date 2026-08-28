import { describe, expect, it } from 'vitest'

import { filterRepositoryNavigation } from './repository-workspace'

describe('filterRepositoryNavigation', () => {
  it('preserves files and filters named collection and media resources', () => {
    const navigation = {
      content: [
        {
          type: 'group' as const,
          name: 'writing',
          label: 'Writing',
          items: [
            { type: 'collection' as const, name: 'posts', label: 'Posts' },
            { type: 'collection' as const, name: 'drafts', label: 'Drafts' },
          ],
        },
        { type: 'file' as const, name: 'settings', label: 'Settings' },
      ],
      media: [{ type: 'media' as const, name: 'default', label: 'Media' }],
    }

    expect(
      filterRepositoryNavigation(navigation, {
        visibility: 'filtered',
        resources: [{ type: 'collection', name: 'posts' }],
      }),
    ).toEqual({
      content: [
        {
          type: 'group',
          name: 'writing',
          label: 'Writing',
          items: [{ type: 'collection', name: 'posts', label: 'Posts' }],
        },
        { type: 'file', name: 'settings', label: 'Settings' },
      ],
      media: [],
    })
  })
})
