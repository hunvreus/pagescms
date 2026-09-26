import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OperationError } from './operation-error'

describe('OperationError', () => {
  it('uses the shared destructive alert treatment', () => {
    const html = renderToStaticMarkup(
      <OperationError error={new Error('Save failed')} fallback="Try again." />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('text-destructive')
    expect(html).toContain('Save failed')
  })

  it('replaces infrastructure failures with contextual copy', () => {
    const html = renderToStaticMarkup(
      <OperationError
        error={new Error('Internal Server Error')}
        fallback="Could not save."
      />,
    )

    expect(html).toContain('Could not save.')
    expect(html).not.toContain('Internal Server Error')
  })
})
