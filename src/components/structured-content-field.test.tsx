import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { StructuredContentField } from './structured-content-field'

describe('StructuredContentField', () => {
  it('places renderer actions in the shared field header', () => {
    const html = renderToStaticMarkup(
      <StructuredContentField
        field={{
          name: 'body',
          type: 'rich-text',
          label: 'Body',
          required: true,
        }}
        value="Hello"
        onChange={() => undefined}
      />,
    )

    const headerStart = html.indexOf('data-slot="field-header"')
    const actionsStart = html.indexOf('data-slot="field-header-actions"')
    const controlStart = html.indexOf('min-h-48')

    expect(headerStart).toBeGreaterThanOrEqual(0)
    expect(actionsStart).toBeGreaterThan(headerStart)
    expect(controlStart).toBeGreaterThan(actionsStart)
    expect(html).toContain('>Body</label>')
    expect(html).toContain('>Required</span>')
    expect(html).toContain('>Editor</button>')
    expect(html).toContain('>Source</button>')
  })

  it('does not render empty header actions for ordinary fields', () => {
    const html = renderToStaticMarkup(
      <StructuredContentField
        field={{ name: 'title', type: 'string', label: 'Title' }}
        value="Hello"
        onChange={() => undefined}
      />,
    )

    expect(html).toContain('data-slot="field-header"')
    expect(html).not.toContain('data-slot="field-header-actions"')
  })
})
