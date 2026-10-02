import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  StructuredContentField,
  keyedMediaValues,
} from './structured-content-field'

describe('StructuredContentField', () => {
  it('gives repeated media values distinct sortable identities', () => {
    expect(keyedMediaValues(['image.png', 'image.png'])).toEqual([
      { id: '0:image.png', index: 0, path: 'image.png' },
      { id: '1:image.png', index: 1, path: 'image.png' },
    ])
  })

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

  it('renders configured select placeholders and date step', () => {
    const select = renderToStaticMarkup(
      <StructuredContentField
        value={undefined}
        field={{
          name: 'status',
          type: 'select',
          options: {
            values: [{ name: 'draft', label: 'Draft' }],
            placeholder: 'Choose a status',
          },
        }}
        onChange={() => undefined}
      />,
    )
    expect(select).toContain('Choose a status')
    const multiple = renderToStaticMarkup(
      <StructuredContentField
        field={{
          name: 'status',
          type: 'select',
          options: {
            multiple: { min: 1, max: 2 },
            values: [
              { name: 'draft', label: 'Draft' },
              { name: 'live', label: 'Published' },
            ],
          },
        }}
        value={['draft']}
        onChange={() => undefined}
      />,
    )
    expect(multiple.match(/role="checkbox"/g)).toHaveLength(2)
    expect(multiple).not.toContain('role="combobox"')
    const date = renderToStaticMarkup(
      <StructuredContentField
        field={{
          name: 'date',
          type: 'date',
          options: { time: true, step: 900 },
        }}
        value="2026-10-02T12:00"
        onChange={() => undefined}
      />,
    )
    expect(date).toContain('step="900"')
  })

  it('provides sortable file handles and reports unknown field types', () => {
    const html = renderToStaticMarkup(
      <StructuredContentField
        field={{ name: 'files', type: 'file', options: { multiple: true } }}
        value={['assets/a.txt', 'assets/b.txt']}
        referenceContext={{
          owner: 'pagescms',
          repo: 'Test',
          branch: 'main',
          media: [
            {
              name: 'files',
              label: 'Files',
              input: 'assets',
              output: '/assets',
              extensions: [],
            },
          ],
        }}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('aria-roledescription="sortable"')
    const unknown = renderToStaticMarkup(
      <StructuredContentField
        value={undefined}
        field={{ name: 'unknown', type: 'not-registered' }}
        onChange={() => undefined}
      />,
    )
    expect(unknown).toContain('Unknown field type')
  })
})
