import { describe, expect, it } from 'vitest'

import { filterRepositoryNavigation } from './repository-shell'

describe('filterRepositoryNavigation', () => {
  it('filters named content and media resources, including fixed files', () => {
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
      ],
      media: [],
    })
  })
  it('uses the named content resource for fixed-file visibility', () => {
    const file = { type: 'file' as const, name: 'settings', label: 'Settings' }
    const navigation = { content: [file], media: [] }
    expect(
      filterRepositoryNavigation(navigation, { visibility: 'none' }),
    ).toEqual({ content: [], media: [] })
    expect(
      filterRepositoryNavigation(navigation, {
        visibility: 'filtered',
        resources: [{ type: 'collection', name: 'settings' }],
      }),
    ).toEqual(navigation)
  })
})
