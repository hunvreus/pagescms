import { describe, expect, it } from 'vitest'

import { parseMediaFolderCreate } from './media'

describe('media folder requests', () => {
  it('normalizes nested media folders', () => {
    expect(
      parseMediaFolderCreate({
        owner: ' PagesCMS ',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        path: '/public/images/',
        folder: '2026/launch',
      }),
    ).toMatchObject({
      owner: 'PagesCMS',
      parent: 'public/images',
      folder: '2026/launch',
    })
  })

  it('protects the marker filename', () => {
    expect(() =>
      parseMediaFolderCreate({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        folder: '.gitkeep',
      }),
    ).toThrow('invalid')
  })
})
