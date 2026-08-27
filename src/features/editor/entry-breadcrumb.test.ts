import { describe, expect, it } from 'vitest'

import { buildEntryBreadcrumb } from './entry-breadcrumb'

describe('buildEntryBreadcrumb', () => {
  it('shows navigation groups before a non-collection entry', () => {
    expect(
      buildEntryBreadcrumb({
        currentLabel: 'Editing "Home"',
        groupTrail: [
          { name: 'website', label: 'Website' },
          { name: 'pages', label: 'Pages' },
        ],
        schemaLabel: 'Home',
        schemaType: 'file',
      }),
    ).toEqual([
      { type: 'group', label: 'Website' },
      { type: 'group', label: 'Pages' },
      { type: 'current', label: 'Editing "Home"' },
    ])
  })

  it('links the collection root and immediate parent for an entry', () => {
    expect(
      buildEntryBreadcrumb({
        currentLabel: 'Editing "Hello"',
        entryPath: 'content/posts/2026/august/hello.md',
        groupTrail: [{ name: 'content', label: 'Content' }],
        rootPath: 'content/posts',
        schemaLabel: 'Posts',
        schemaType: 'collection',
      }),
    ).toEqual([
      { type: 'group', label: 'Content' },
      { type: 'root', label: 'Posts' },
      {
        type: 'ellipsis',
        items: [{ label: '2026', path: 'content/posts/2026' }],
      },
      {
        type: 'folder',
        label: 'august',
        path: 'content/posts/2026/august',
      },
      { type: 'current', label: 'Editing "Hello"' },
    ])
  })

  it('does not add folder segments for an entry at the collection root', () => {
    expect(
      buildEntryBreadcrumb({
        currentLabel: 'Editing "Hello"',
        entryPath: 'content/posts/hello.md',
        rootPath: 'content/posts',
        schemaLabel: 'Posts',
        schemaType: 'collection',
      }),
    ).toEqual([
      { type: 'root', label: 'Posts' },
      { type: 'current', label: 'Editing "Hello"' },
    ])
  })

  it('uses the creation parent when building a new-entry breadcrumb', () => {
    expect(
      buildEntryBreadcrumb({
        currentLabel: 'New entry',
        creationParent: 'content/posts/guides',
        rootPath: 'content/posts',
        schemaLabel: 'Posts',
        schemaType: 'collection',
      }),
    ).toEqual([
      { type: 'root', label: 'Posts' },
      { type: 'folder', label: 'guides', path: 'content/posts/guides' },
      { type: 'current', label: 'New entry' },
    ])
  })

  it('rejects paths outside the configured collection root', () => {
    expect(() =>
      buildEntryBreadcrumb({
        currentLabel: 'Editing "Secrets"',
        entryPath: 'private/secrets.md',
        rootPath: 'content/posts',
        schemaLabel: 'Posts',
        schemaType: 'collection',
      }),
    ).toThrow('outside root')
  })
})
