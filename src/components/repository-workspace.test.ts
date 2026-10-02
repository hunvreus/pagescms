import { describe, expect, it } from 'vitest'

import {
  filterRepositoryActions,
  filterRepositoryNavigation,
} from './repository-workspace'

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

describe('filterRepositoryActions', () => {
  const actions = [
    { name: 'deploy', label: 'Deploy', workflow: 'deploy.yml' },
    { name: 'preview', label: 'Preview', workflow: 'preview.yml' },
  ]

  it('keeps only actions exposed by filtered discovery', () => {
    expect(
      filterRepositoryActions(actions, {
        visibility: 'filtered',
        resources: [{ type: 'action', name: 'preview' }],
      }),
    ).toEqual([actions[1]])
  })

  it('keeps all actions for unrestricted discovery', () => {
    expect(filterRepositoryActions(actions, { visibility: 'all' })).toEqual(
      actions,
    )
  })
})
