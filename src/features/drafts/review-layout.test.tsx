import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { reviewBounds } from './use-review-viewport'
import { DraftFieldPreview } from './draft-field-preview'

describe('visible review viewport', () => {
  it('fits inside a zoomed and panned viewport rather than the layout viewport', () => {
    expect(
      reviewBounds({ left: 399, top: 125, width: 740, height: 440 }),
    ).toEqual({
      left: 769,
      top: 149,
      width: 692,
      maxWidth: 'calc(var(--container-3xl) * 2)',
      height: 392,
      translate: '-50% 0',
      transform: 'none',
    })
    expect(
      reviewBounds({ left: 0, top: 0, width: 390, height: 844 }),
    ).toMatchObject({ left: 195, top: 8, width: 374, height: 828 })
  })
})
describe('read-only conflict fields', () => {
  it('renders configured controls and labels for nested objects without raw JSON', () => {
    const markup = renderToStaticMarkup(
      <TestI18n>
        {
          <DraftFieldPreview
            label="Author"
            value={{
              exists: true,
              value: { name: 'Alice', email: 'alice@example.com' },
            }}
            field={{
              name: 'author',
              type: 'object',
              fields: [
                { name: 'name', label: 'Name', type: 'string' },
                { name: 'email', label: 'Email', type: 'string' },
              ],
            }}
          />
        }
      </TestI18n>,
    )
    expect(markup).toContain('value="alice@example.com"')
    expect(markup).toContain('>Author</label>')
    expect(markup).toContain('>Email</label>')
    expect(markup).toContain('readOnly=""')
    expect(markup).not.toContain('<pre')
  })
  it('expands lists for comparison and excludes edit/reorder/remove controls', () => {
    const markup = renderToStaticMarkup(
      <TestI18n>
        {
          <DraftFieldPreview
            label="Items"
            value={{
              exists: true,
              value: [{ title: 'First' }, { title: 'Second' }],
            }}
            field={{
              name: 'items',
              type: 'object',
              list: { collapsible: { collapsed: true } },
              fields: [{ name: 'title', label: 'Title', type: 'string' }],
            }}
          />
        }
      </TestI18n>,
    )
    expect(markup).toContain('value="First"')
    expect(markup).toContain('value="Second"')
    expect(markup).not.toContain('Reorder item')
    expect(markup).not.toContain('Add item')
    expect(markup).not.toContain('Remove item')
    expect(markup).not.toContain('Expand all')
    expect(markup).not.toContain('<pre')
  })
  it('keeps raw source readable and makes empty/removal choices explicit', () => {
    const markup = renderToStaticMarkup(
      <TestI18n>
        {
          <DraftFieldPreview
            label="Source"
            value={{ exists: true, value: '<script>unsafe()</script>' }}
          />
        }
      </TestI18n>,
    )
    expect(markup).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
    expect(markup).toContain('>Source</label>')
    expect(
      renderToStaticMarkup(
        <TestI18n>
          {<DraftFieldPreview label="Source" value={{ exists: false }} />}
        </TestI18n>,
      ),
    ).toContain('Removed')
    expect(
      renderToStaticMarkup(
        <TestI18n>
          {
            <DraftFieldPreview
              label="Source"
              value={{ exists: true, value: null }}
            />
          }
        </TestI18n>,
      ),
    ).toContain('Empty')
  })
})
