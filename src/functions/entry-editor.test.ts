import { describe, expect, it } from 'vitest'

import {
  parseCollectionFolderCreate,
  parseEntryUpdate,
  parseRawEntryCreate,
  parseStructuredEntryUpdate,
} from './entry-editor'

describe('entry creation requests', () => {
  it('normalizes raw entry parents', () => {
    expect(
      parseRawEntryCreate({
        owner: ' PagesCMS ',
        repo: 'pages-cms',
        branch: 'main',
        name: 'posts',
        parent: '/content/posts/drafts/',
        filename: 'hello.md',
        source: '# Hello',
      }),
    ).toMatchObject({
      owner: 'PagesCMS',
      parent: 'content/posts/drafts',
      filename: 'hello.md',
    })
  })

  it('accepts nested folder paths but protects the marker file', () => {
    expect(
      parseCollectionFolderCreate({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'posts',
        parent: 'content/posts',
        folder: '2026/launches',
      }),
    ).toMatchObject({ folder: '2026/launches' })
    expect(() =>
      parseCollectionFolderCreate({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'posts',
        parent: 'content/posts',
        folder: '.gitkeep',
      }),
    ).toThrow('invalid')
  })

  it('accepts a null sha when creating a missing fixed file', () => {
    expect(
      parseEntryUpdate({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'settings',
        path: 'data/settings.yml',
        source: 'title: Settings',
        sha: null,
      }).sha,
    ).toBeNull()
    expect(
      parseStructuredEntryUpdate({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'settings',
        path: 'data/settings.yml',
        content: { title: 'Settings' },
        sha: null,
      }).sha,
    ).toBeNull()
  })
})
