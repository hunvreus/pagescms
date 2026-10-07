import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RepositoryGitHubLinkContext } from '#/hooks/use-repository-github-link'

import {
  StructuredContentField,
  keyedMediaValues,
  sortableItemStyle,
} from './structured-content-field'

describe('StructuredContentField', () => {
  it('distinguishes clearing a selected block from removing its list item', () => {
    const html = renderToStaticMarkup(
      <StructuredContentField
        field={{
          name: 'layout',
          type: 'block',
          list: { collapsible: { collapsed: true } },
          blocks: [{ name: 'widget', fields: [] }],
        }}
        value={[{ _block: 'widget' }]}
        onChange={() => undefined}
      />,
    )
    const clearStart = html.indexOf('aria-label="Reset block in item 1"')
    const removeStart = html.indexOf('aria-label="Remove item 1"')
    expect(clearStart).toBeGreaterThanOrEqual(0)
    expect(removeStart).toBeGreaterThan(clearStart)
  })
  it('moves unequal-sized sortable items without scaling or fading them', () => {
    const style = sortableItemStyle(
      { x: 12, y: 80, scaleX: 0.6, scaleY: 2.5 },
      undefined,
      true,
    )
    expect(style.transform).toBe('translate3d(12px, 80px, 0)')
    expect(style.transform).not.toContain('scale')
    expect(style.opacity).toBeUndefined()
    expect(style.zIndex).toBe(1)
    expect(sortableItemStyle(null, 'transform 200ms ease', false)).toEqual({
      transform: undefined,
      transition: 'transform 200ms ease',
      position: 'relative',
      zIndex: undefined,
    })
  })

  it('gives repeated media values distinct sortable identities', () => {
    expect(keyedMediaValues(['image.png', 'image.png'])).toEqual([
      { id: '0:image.png', index: 0, path: 'image.png' },
      { id: '1:image.png', index: 1, path: 'image.png' },
    ])
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
    expect(html).toContain('>a.txt</span>')
    expect(html).not.toContain('href="https://github.com')
    const unknown = renderToStaticMarkup(
      <StructuredContentField
        value={undefined}
        field={{ name: 'unknown', type: 'not-registered' }}
        onChange={() => undefined}
      />,
    )
    expect(unknown).toContain('Unknown field type')
  })

  it('links file names only with repository GitHub access and preserves branch and full path', () => {
    const html = renderToStaticMarkup(
      <RepositoryGitHubLinkContext.Provider value={true}>
        <StructuredContentField
          field={{ name: 'file', type: 'file' }}
          value="assets/folder/image.png"
          referenceContext={{
            owner: 'pagescms',
            repo: 'Test',
            branch: 'feature/media',
            media: [
              {
                name: 'default',
                label: 'Default',
                input: 'assets',
                output: '/assets',
                extensions: [],
              },
            ],
          }}
          onChange={() => undefined}
        />
      </RepositoryGitHubLinkContext.Provider>,
    )
    expect(html).toContain(
      'https://github.com/pagescms/Test/blob/feature%2Fmedia/assets/folder/image.png',
    )
    expect(html).toContain('>folder/image.png</span>')
  })
})
