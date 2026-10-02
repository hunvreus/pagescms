import { describe, expect, it } from 'vitest'

import {
  richTextValueForEditor,
  richTextValueForStorage,
} from './rich-text-media'

const media = {
  name: 'images',
  input: 'public/images',
  output: '/images',
  extensions: ['png'],
}
const context = {
  owner: 'pages cms',
  repo: 'website',
  branch: 'feature/editor',
  name: 'images',
}

describe('rich-text media paths', () => {
  it('uses preview URLs in Markdown without changing external images', () => {
    const value =
      '![Local](</images/photo one (1).png>)\n\n![Remote](https://example.com/photo.png)'
    const editorValue = richTextValueForEditor(value, media, context)

    expect(editorValue).toContain(
      '/api/media-preview/pages%20cms/website/feature%2Feditor/images/public/images/photo%20one%20(1).png',
    )
    expect(editorValue).toContain('https://example.com/photo.png')
    expect(richTextValueForStorage(editorValue, media, context)).toBe(value)
  })

  it('restores configured output paths from Markdown preview URLs', () => {
    const original = '![Photo](/images/photo.png "Photo")'
    const editorValue = richTextValueForEditor(original, media, context)

    expect(richTextValueForStorage(editorValue, media, context)).toBe(original)
  })

  it('round trips HTML image sources', () => {
    const original = '<p><img src="/images/folder/photo.png" alt="Photo"></p>'
    const editorValue = richTextValueForEditor(original, media, context)

    expect(editorValue).toContain('/api/media-preview/')
    expect(richTextValueForStorage(editorValue, media, context)).toBe(original)
  })

  it('leaves unrelated repository paths unchanged', () => {
    const value = '![Other](/uploads/photo.png)'
    expect(richTextValueForEditor(value, media, context)).toBe(value)
    expect(richTextValueForStorage(value, media, context)).toBe(value)
  })
})
