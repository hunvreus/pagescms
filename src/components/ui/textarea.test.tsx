import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Textarea } from './textarea'

describe('Textarea', () => {
  it('uses the shadcn autoresizing baseline', () => {
    const html = renderToStaticMarkup(<Textarea />)

    expect(html).toContain('field-sizing-content')
    expect(html).toContain('min-h-16')
    expect(html).not.toContain('min-h-24')
  })
})
