import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OperationError } from './operation-error'

describe('OperationError', () => {
  it('uses the shared destructive alert treatment', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <OperationError
            error={new Error('Save failed')}
            fallback="Try again."
          />
        }
      </TestI18n>,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Save failed')
  })

  it('gives persistent recovery failures a title', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <OperationError
            error={new Error('Could not load the latest version.')}
            title="Could not review changes"
          />
        }
      </TestI18n>,
    )

    expect(html).toContain('data-slot="alert-title"')
    expect(html).toContain('Could not review changes')
    expect(html).toContain('Could not load the latest version.')
  })

  it('replaces infrastructure failures with contextual copy', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <OperationError
            error={new Error('Internal Server Error')}
            fallback="Could not save."
          />
        }
      </TestI18n>,
    )

    expect(html).toContain('Could not save.')
    expect(html).not.toContain('Internal Server Error')
  })
})
