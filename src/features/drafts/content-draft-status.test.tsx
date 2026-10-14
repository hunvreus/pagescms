import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ContentDraftIndicator,
  ContentDraftRecovery,
} from './content-draft-status'

const saved = {
  ready: true,
  dirty: true,
  error: null,
  status: 'Saved on this device',
}

describe('local draft feedback', () => {
  it('acknowledges persisted and restored local changes with the same quiet icon', () => {
    for (const status of [
      'Saved on this device',
      'Restored draft saved on this device',
    ]) {
      expect(
        renderToStaticMarkup(
          <ContentDraftIndicator draft={{ ...saved, status }} />,
        ),
      ).toContain('aria-label="Unsaved changes"')
    }
  })

  it('hides feedback when clean, loading, failing, or saving to GitHub', () => {
    for (const changes of [
      { dirty: false },
      { ready: false },
      { error: new Error('Storage failed') },
    ]) {
      expect(
        renderToStaticMarkup(
          <ContentDraftIndicator draft={{ ...saved, ...changes }} />,
        ),
      ).toBe('')
    }
    expect(
      renderToStaticMarkup(<ContentDraftIndicator draft={saved} saving />),
    ).toBe('')
    expect(
      renderToStaticMarkup(
        <ContentDraftIndicator draft={{ ...saved, status: '' }} />,
      ),
    ).not.toContain('aria-label="Unsaved changes"')
  })

  it('reserves the form-level message and recovery actions for failures', () => {
    const draft = {
      ...saved,
      download: () => undefined,
      discard: async () => undefined,
    }
    expect(renderToStaticMarkup(<ContentDraftRecovery draft={draft} />)).toBe(
      '',
    )
    const markup = renderToStaticMarkup(
      <ContentDraftRecovery
        draft={{
          ...draft,
          error: new Error('Storage failed'),
          status: 'Local draft unavailable — keep this tab open',
        }}
      />,
    )
    expect(markup).toContain('Download local draft')
    expect(markup).toContain('Discard local draft')
    expect(markup).toContain('Local draft unavailable')
  })
})
