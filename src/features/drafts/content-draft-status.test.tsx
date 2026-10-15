import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContentDraftRecovery } from './content-draft-status'

const saved = {
  ready: true,
  dirty: true,
  error: null,
  status: 'Saved on this device',
}

describe('local draft recovery', () => {
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
