import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DraftBadge, DraftSaveButton } from './draft-save-button'
import type { DraftControls } from './draft-save-button'

const saved: DraftControls = {
  ready: true,
  dirty: true,
  error: null,
  attentionRevision: 0,
  savedAt: Date.now(),
  download: () => undefined,
  discard: async () => undefined,
}

function render(draft: DraftControls, busy = false) {
  return renderToStaticMarkup(
    <TestI18n>
      {
        <>
          <DraftBadge draft={draft} busy={busy} />
          <DraftSaveButton draft={draft} busy={busy} onSave={() => undefined} />
        </>
      }
    </TestI18n>,
  )
}

describe('draft badge', () => {
  it('shows a muted Draft button only when a local draft exists', () => {
    expect(render({ ...saved, dirty: false, savedAt: null })).not.toContain(
      'Local draft:',
    )
    expect(render({ ...saved, savedAt: null })).not.toContain('Local draft:')
    const markup = render(saved)
    expect(markup).toContain('>Draft<svg')
    expect(markup).toContain('data-variant="secondary"')
    expect(markup).toContain('text-muted-foreground')
    expect(markup).toContain('opacity-50')
    expect(markup).not.toContain('<time')
  })

  it('keeps the error badge available when restoration has blocked the editor', () => {
    const markup = render({
      ...saved,
      dirty: false,
      ready: false,
      savedAt: null,
      error: new Error('Storage failed'),
    })
    expect(markup).toContain('data-variant="destructive"')
    expect(markup).toContain('aria-label="Local draft: needs attention"')
    const badge = markup.match(/<button[^>]*>Draft<svg[\s\S]*?<\/button>/)?.[0]
    expect(badge).toBeDefined()
    expect(badge).not.toContain(' disabled=""')
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Save<\/button>/)
    expect(markup).not.toContain('Download draft')
    expect(markup).toContain('Your local draft needs attention.')
  })

  it('keeps draft details available while a save is running', () => {
    const markup = render(saved, true)
    const badge = markup.match(/<button[^>]*>Draft<svg[\s\S]*?<\/button>/)?.[0]
    expect(badge).toBeDefined()
    expect(badge).not.toContain(' disabled=""')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toMatch(/>Save<svg[^>]*aria-hidden="true"/)
  })
})
