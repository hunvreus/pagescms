import { TestI18n } from '#/i18n/test-provider'
import type { JsonObject, JsonValue } from '#/shared/json'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CollectionCell, CollectionReferenceLabels } from './collection-cell'

const repository = {
  owner: 'pagescms',
  repo: 'test',
  branch: 'main',
  source: 'github.com',
}

describe('CollectionCell', () => {
  it('renders rich text as readable plain text', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <CollectionCell
            column={{
              path: 'body',
              label: 'Body',
              type: 'rich-text',
              field: { name: 'body', type: 'rich-text' },
            }}
            media={[]}
            repository={repository}
            value={'# Heading\n\n**Bold** &amp; <span>HTML</span>'}
          />
        }
      </TestI18n>,
    )

    expect(html).toContain('Heading Bold &amp; HTML')
    expect(html).not.toContain('**')
    expect(html).not.toContain('# Heading')
  })

  it('condenses multiple references to the first label and a count', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        <CollectionReferenceLabels
          value={
            new Map([['authors', new Map([['authors/maria.md', 'Maria']])]])
          }
        >
          <CollectionCell
            column={{
              path: 'authors',
              label: 'Authors',
              type: 'reference',
              field: { name: 'authors', type: 'reference' },
            }}
            media={[]}
            repository={repository}
            value={['authors/maria.md', 'authors/bob.md']}
          />
        </CollectionReferenceLabels>
      </TestI18n>,
    )

    expect(html).toContain('Maria')
    expect(html).toContain('+1')
    expect(html).not.toContain('authors/bob.md')
  })
})

describe('collection cell parity regressions', () => {
  function render(
    type: string,
    value: JsonValue,
    field: JsonObject = { name: 'value', type },
  ) {
    return renderToStaticMarkup(
      <TestI18n>
        {
          <CollectionCell
            column={{ path: 'value', label: 'Value', type, field }}
            media={[]}
            repository={repository}
            value={value}
          />
        }
      </TestI18n>,
    )
  }
  it('displays file basenames, an icon and extra item count', () => {
    const html = render('file', [
      'assets/folder/guide.pdf',
      'assets/second.pdf',
    ])
    expect(html).toContain('guide.pdf')
    expect(html).toContain('<svg')
    expect(html).toContain('+1')
    expect(html).not.toContain('assets/folder')
  })
  it('keeps extra counts for boolean and date lists', () => {
    expect(render('boolean', [false, true])).toContain('+1')
    expect(render('date', ['2026-10-19', '2026-10-20'])).toContain('+1')
  })
  it('keeps the time for stored datetime formats without a T', () => {
    const html = render('date', '19/10/2026 14:35', {
      name: 'value',
      type: 'date',
      options: { format: 'dd/MM/yyyy HH:mm', time: true },
    })
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(2026, 9, 19, 14, 35))
    expect(html).toContain(expected)
  })
  it('renders absolute timestamps deterministically across time zones', () => {
    expect(render('date', '2026-01-01T00:30:00Z')).toContain('Jan 1, 2026')
  })
  it('uses static option labels and saved reference label fallbacks', () => {
    expect(
      render('select', 'draft', {
        name: 'value',
        type: 'select',
        options: { values: [{ value: 'draft', label: 'Draft label' }] },
      }),
    ).toContain('Draft label')
    expect(
      render('reference', { value: 'authors/ada', label: 'Ada Lovelace' }),
    ).toContain('Ada Lovelace')
  })
})

it('defers image URL resolution when repository metadata contains source', () => {
  const html = renderToStaticMarkup(
    <TestI18n>
      {
        <CollectionCell
          column={{
            path: 'image',
            label: 'Image',
            type: 'image',
            field: { name: 'image', type: 'image' },
          }}
          repository={repository}
          media={[
            {
              name: 'images',
              input: 'uploads',
              output: 'https://cdn.example.com/assets',
              extensions: [],
            },
          ]}
          value="https://cdn.example.com/assets/photo.png"
        />
      }
    </TestI18n>,
  )
  expect(html).not.toContain('/api/media-preview/')
  expect(html).toContain('data-state="loading"')
  expect(html).not.toContain('src="github.com"')
})
