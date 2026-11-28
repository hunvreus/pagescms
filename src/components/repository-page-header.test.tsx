import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RepositoryPageHeader } from './repository-page-header'

describe('RepositoryPageHeader', () => {
  it('keeps the server and initial client live region stable', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {<RepositoryPageHeader refreshing>Title</RepositoryPageHeader>}
      </TestI18n>,
    )

    expect(html).not.toContain('Refreshing page')
  })
})
