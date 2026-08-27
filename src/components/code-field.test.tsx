import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import CodeField from './code-field'

describe('CodeField', () => {
  it('renders a small syntax-highlighted editing surface', () => {
    const html = renderToStaticMarkup(
      <CodeField
        disabled={false}
        field={{ name: 'script', type: 'code', options: { format: 'js' } }}
        id="script-field"
        label="Script"
        required={true}
        value={'const answer = 42 // result'}
        onChange={() => undefined}
      />,
    )

    expect(html).toContain('code-token-keyword')
    expect(html).toContain('code-token-number')
    expect(html).toContain('code-token-comment')
    expect(html).toContain('<textarea')
    expect(html).toContain('required=""')
  })
})
