import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { TestI18n } from '#/i18n/test-provider'
import { MediaPageSkeleton } from './media-skeleton'

it('shows the page header while the media route loads', () => {
  const html = renderToStaticMarkup(
    <TestI18n>
      <MediaPageSkeleton />
    </TestI18n>,
  )

  expect(html).toContain('data-slot="repository-page-header"')
  expect(html).toContain('data-slot="skeleton"')
})
