import { describe, expect, it } from 'vitest'

import {
  allowedMediaFieldExtensions,
  mediaInputPath,
  mediaOutputPath,
  relativeMediaPath,
  transformMediaFieldValues,
  validateMediaFieldValues,
} from './media-field-values'

const media = [
  {
    name: 'images',
    input: 'static/uploads',
    output: '/uploads',
    extensions: ['jpg', 'png', 'pdf'],
  },
]

describe('media field values', () => {
  it('displays paths relative to the media root without stripping unrelated prefixes', () => {
    expect(
      relativeMediaPath('static/uploads/folder/a.png', 'static/uploads'),
    ).toBe('folder/a.png')
    expect(
      relativeMediaPath('static/uploads-other/a.png', 'static/uploads'),
    ).toBe('static/uploads-other/a.png')
    expect(relativeMediaPath('a.png', '')).toBe('a.png')
    expect(
      relativeMediaPath('https://example.com/a.png', 'static/uploads'),
    ).toBe('https://example.com/a.png')
  })
  it('maps rich-text image paths across input and output roots', () => {
    expect(mediaInputPath('/uploads/cover.jpg', media[0])).toBe(
      'static/uploads/cover.jpg',
    )
    expect(mediaOutputPath('static/uploads/cover.jpg', media[0])).toBe(
      '/uploads/cover.jpg',
    )
    expect(mediaInputPath('/cover.jpg', { ...media[0], output: '/' })).toBe(
      'static/uploads/cover.jpg',
    )
    expect(mediaInputPath('https://example.com/cover.jpg', media[0])).toBe(
      'https://example.com/cover.jpg',
    )
  })

  it('translates public paths for editing and restores them for persistence', () => {
    const fields = [
      { name: 'cover', type: 'image' },
      {
        name: 'sections',
        type: 'object',
        list: true,
        fields: [{ name: 'asset', type: 'file' }],
      },
    ]
    const stored = {
      cover: '/uploads/cover.jpg',
      sections: [{ asset: '/uploads/guide.pdf' }],
    }
    const editable = transformMediaFieldValues(fields, stored, media, 'read')

    expect(editable).toEqual({
      cover: 'static/uploads/cover.jpg',
      sections: [{ asset: 'static/uploads/guide.pdf' }],
    })
    expect(transformMediaFieldValues(fields, editable, media, 'write')).toEqual(
      stored,
    )
  })

  it('translates fields nested in selected blocks and root lists', () => {
    const fields = [
      {
        name: 'content',
        type: 'block',
        blockKey: 'kind',
        blocks: [
          {
            name: 'hero',
            fields: [{ name: 'background', type: 'image' }],
          },
        ],
      },
    ]
    expect(
      transformMediaFieldValues(
        fields,
        [{ content: { kind: 'hero', background: '/uploads/hero.png' } }],
        media,
        'read',
      ),
    ).toEqual([
      {
        content: {
          kind: 'hero',
          background: 'static/uploads/hero.png',
        },
      },
    ])
  })

  it('intersects field categories and extensions with the media schema', () => {
    expect(
      allowedMediaFieldExtensions(
        { name: 'cover', type: 'image', options: { categories: ['image'] } },
        media[0],
      ),
    ).toEqual(['jpg', 'png'])
    expect(
      allowedMediaFieldExtensions(
        { name: 'asset', type: 'file', options: { extensions: ['.PDF'] } },
        media[0],
      ),
    ).toEqual(['pdf'])
  })

  it('validates roots, extensions, and uniqueness against editor paths', () => {
    const fields = [
      {
        name: 'gallery',
        type: 'image',
        options: { multiple: true, unique: true, extensions: ['png'] },
      },
    ]
    expect(
      validateMediaFieldValues(
        fields,
        {
          gallery: [
            'static/uploads/photo.jpg',
            'other/photo.png',
            'other/photo.png',
          ],
        },
        media,
      ),
    ).toEqual([
      'gallery must be unique',
      'gallery uses a disallowed file extension',
      'gallery must be inside static/uploads',
      'gallery must be inside static/uploads',
    ])
  })

  it('leaves media-disabled and external values unchanged', () => {
    const fields = [
      { name: 'asset', type: 'file', options: { media: false } },
      { name: 'cover', type: 'image' },
    ]
    const content = {
      asset: 'documents/report.pdf',
      cover: 'https://cdn.example.com/cover.jpg',
    }
    expect(transformMediaFieldValues(fields, content, media, 'write')).toEqual(
      content,
    )
  })

  it('handles a slash output root without corrupting path boundaries', () => {
    const rootMedia = [{ ...media[0], output: '/' }]
    const fields = [{ name: 'asset', type: 'file' }]
    expect(
      transformMediaFieldValues(
        fields,
        { asset: '/guide.pdf' },
        rootMedia,
        'read',
      ),
    ).toEqual({ asset: 'static/uploads/guide.pdf' })
    expect(
      transformMediaFieldValues(
        fields,
        { asset: 'static/uploads/guide.pdf' },
        rootMedia,
        'write',
      ),
    ).toEqual({ asset: '/guide.pdf' })
  })
})
