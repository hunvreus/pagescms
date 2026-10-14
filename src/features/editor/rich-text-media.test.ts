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

  it('previews encoded filenames without double-encoding and restores their output paths', () => {
    const value = '![Photo](/images/photo%20one.png)'
    const preview = richTextValueForEditor(value, media, context)
    expect(preview).toContain('public/images/photo%20one.png')
    expect(preview).not.toContain('%2520')
    expect(richTextValueForStorage(preview, media, context)).toBe(
      '![Photo](/images/photo%20one.png)',
    )
  })

  it('preserves literal percent-escape sequences in filenames', () => {
    for (const value of [
      '![Photo](/images/photo%2520.png)',
      '![Photo](</images/photo%2520.png>)',
    ]) {
      const preview = richTextValueForEditor(value, media, context)
      expect(preview).toContain('photo%2520.png')
      expect(richTextValueForStorage(preview, media, context)).toBe(value)
    }
  })

  it('keeps encoded parentheses valid in bare Markdown destinations', () => {
    const value = '![Photo](/images/photo%28one%29.png)'
    const preview = richTextValueForEditor(value, media, context)
    expect(preview).toContain('photo%28one%29.png')
    expect(richTextValueForStorage(preview, media, context)).toBe(value)
  })

  it('keeps malformed URL escapes without crashing', () => {
    expect(() =>
      richTextValueForEditor('![Photo](/images/photo%ZZ.png)', media, context),
    ).not.toThrow()
  })

  it('leaves unrelated repository paths unchanged', () => {
    const value = '![Other](/uploads/photo.png)'
    expect(richTextValueForEditor(value, media, context)).toBe(value)
    expect(richTextValueForStorage(value, media, context)).toBe(value)
  })
})
