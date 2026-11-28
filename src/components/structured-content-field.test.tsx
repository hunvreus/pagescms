import { TestI18n } from '#/i18n/test-provider'
import { FieldValidationProvider } from '#/features/editor/fields/field-validation'
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { RepositoryGitHubLinkContext } from '#/hooks/use-repository-github-link'
import { mediaQueryOptions } from '#/client/queries/content'

import {
  StructuredContentField,
  keyedMediaValues,
  sortableItemStyle,
} from './structured-content-field'

function renderToStaticMarkup(element: ReactNode, client = new QueryClient()) {
  return renderMarkup(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  )
}

describe('StructuredContentField', () => {
  it('distinguishes clearing a selected block from removing its list item', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <StructuredContentField
            field={{
              name: 'layout',
              type: 'block',
              list: { collapsible: { collapsed: true } },
              blocks: [{ name: 'widget', fields: [] }],
            }}
            value={[{ _block: 'widget' }]}
            onChange={() => undefined}
          />
        }
      </TestI18n>,
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
      <TestI18n>
        {
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
          />
        }
      </TestI18n>,
    )
    expect(select).toContain('Choose a status')
    const multiple = renderToStaticMarkup(
      <TestI18n>
        {
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
          />
        }
      </TestI18n>,
    )
    expect(multiple).toContain('role="combobox"')
    expect(multiple).toContain('data-slot="combobox-chip"')
    expect(multiple).toContain('Draft')
    expect(multiple).not.toContain('role="checkbox"')
    const date = renderToStaticMarkup(
      <TestI18n>
        {
          <StructuredContentField
            field={{
              name: 'date',
              type: 'date',
              options: { time: true, step: 900 },
            }}
            value="2026-10-02T12:00"
            onChange={() => undefined}
          />
        }
      </TestI18n>,
    )
    expect(date).toContain('step="900"')
  })

  it('defers image delivery to the client even when the repository has a source', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <RepositoryGitHubLinkContext.Provider value={true}>
            <StructuredContentField
              field={{ name: 'image', type: 'image' }}
              value="assets/photo.svg"
              referenceContext={{
                source: 'github.com',
                owner: 'pagescms',
                repo: 'Test',
                branch: 'main',
                media: [
                  {
                    name: 'images',
                    label: 'Images',
                    input: 'assets',
                    output: '/assets',
                    extensions: [],
                  },
                ],
              }}
              onChange={() => undefined}
            />
          </RepositoryGitHubLinkContext.Provider>
        }
      </TestI18n>,
    )
    expect(html).not.toContain('/api/media-preview/')
    expect(html).toContain('data-state="loading"')
    expect(html).not.toContain('src="github.com"')
    expect(html).not.toContain('View assets/photo.svg on GitHub')
  })

  it('provides sortable file handles and reports unknown field types', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
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
          />
        }
      </TestI18n>,
    )
    expect(html).toContain('aria-roledescription="sortable"')
    expect(html).toContain('>a.txt</span>')
    expect(html).not.toContain('href="https://github.com')
    const unknown = renderToStaticMarkup(
      <TestI18n>
        {
          <StructuredContentField
            value={undefined}
            field={{ name: 'unknown', type: 'not-registered' }}
            onChange={() => undefined}
          />
        }
      </TestI18n>,
    )
    expect(unknown).toContain('Unknown field type')
  })

  it.each(['github', 's3'])(
    'links media only when the effective provider is GitHub (%s)',
    (provider) => {
      const client = new QueryClient()
      client.setQueryData(
        [
          ...mediaQueryOptions({
            owner: 'pagescms',
            repo: 'Test',
            branch: 'feature/media',
            name: 'default',
            path: 'assets',
          }).queryKey,
        ],
        { media: { provider } },
      )
      const html = renderToStaticMarkup(
        <TestI18n>
          {
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
            </RepositoryGitHubLinkContext.Provider>
          }
        </TestI18n>,
        client,
      )
      expect(
        html.includes(
          'https://github.com/pagescms/Test/blob/feature%2Fmedia/assets/folder/image.png',
        ),
      ).toBe(provider === 'github')
      expect(html).toContain('>folder/image.png</span>')
    },
  )
})

describe('field validation presentation', () => {
  it.each([false, true])(
    'propagates inherited readonly through lists (collapsible=%s)',
    (collapsible) => {
      const html = renderToStaticMarkup(
        <TestI18n>
          {
            <StructuredContentField
              inheritedReadonly
              field={{
                name: 'items',
                type: 'object',
                list: { collapsible },
                fields: [{ name: 'title', type: 'string' }],
              }}
              value={[{ title: 'Locked' }]}
              onChange={() => undefined}
            />
          }
        </TestI18n>,
      )
      expect(html).toMatch(/<input[^>]*disabled=""/)
      expect(html).not.toContain('Remove item')
      expect(html).not.toContain('Add item')
    },
  )

  it('keeps readonly inputs focusable and textarea native constraints intact', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <StructuredContentField
            field={{
              name: 'summary',
              type: 'text',
              readonly: true,
              options: { minlength: 3, maxlength: 40 },
            }}
            value="Readable"
            onChange={() => undefined}
          />
        }
      </TestI18n>,
    )
    expect(html).toContain('readOnly=""')
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('minLength="3"')
    expect(html).toContain('maxLength="40"')
  })
  it('shows missing media configuration accurately', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <StructuredContentField
            field={{ name: 'cover', type: 'image' }}
            value="image.png"
            onChange={() => undefined}
          />
        }
      </TestI18n>,
    )
    expect(html).toContain('Media is not configured')
    expect(html).not.toContain('Unknown field type')
  })
  it('renders indexed multiple-selection errors beside the field and marks the input invalid', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <FieldValidationProvider
            validation={{
              issues: [
                {
                  path: 'topics.0',
                  message: 'topics.0 must use a configured option',
                },
              ],
              clear: () => undefined,
            }}
          >
            <StructuredContentField
              field={{
                name: 'topics',
                type: 'select',
                options: { multiple: true, values: ['News'] },
              }}
              value={['Old']}
              onChange={() => undefined}
            />
          </FieldValidationProvider>
        }
      </TestI18n>,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('topics.0 must use a configured option')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby=')
  })
})
