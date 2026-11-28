import { TestI18n } from '#/i18n/test-provider'
import type * as MockedModule from '@tiptap/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Editor } from './ui/editor'
import { ConfigurationSkeleton } from '#/features/admin/configuration-skeleton'

// Simulate Tiptap's first render, before immediatelyRender:false initializes it.
vi.mock('@tiptap/react', async (original) => ({
  ...(await original<typeof MockedModule>()),
  useEditor: () => null,
  useEditorState: () => null,
}))

describe('editor loading shapes', () => {
  it('keeps a default-height shape while rich text initializes without emitting content', () => {
    const onChange = vi.fn()
    const html = renderToStaticMarkup(
      <TestI18n>
        {<Editor value="<p>Retained content</p>" onChange={onChange} />}
      </TestI18n>,
    )
    expect(html).toContain('aria-label="Loading editor"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('min-h-32')
    expect(html).not.toContain('Retained content')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses one default-height configuration shape without mocked text lines', () => {
    const html = renderToStaticMarkup(
      <TestI18n>{<ConfigurationSkeleton />}</TestI18n>,
    )
    expect(html).toContain('aria-label="Loading configuration"')
    expect(html).toContain('min-h-32')
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(1)
  })
})
