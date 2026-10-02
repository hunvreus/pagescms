import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RepositoryPageHeader } from './repository-page-header'

describe('RepositoryPageHeader', () => {
  it('keeps the server and initial client live region stable', () => {
    const html = renderToStaticMarkup(
      <RepositoryPageHeader refreshing>Title</RepositoryPageHeader>,
    )

    expect(html).not.toContain('Refreshing page')
  })
})
