import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CollectionCell } from './collection-cell'

const repository = {
  owner: 'pagescms',
  repo: 'test',
  branch: 'main',
}

describe('CollectionCell', () => {
  it('renders rich text as readable plain text', () => {
    const html = renderToStaticMarkup(
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
      />,
    )

    expect(html).toContain('Heading Bold &amp; HTML')
    expect(html).not.toContain('**')
    expect(html).not.toContain('# Heading')
  })

  it('condenses multiple references to the first label and a count', () => {
    const html = renderToStaticMarkup(
      <CollectionCell
        column={{
          path: 'authors',
          label: 'Authors',
          type: 'reference',
          field: { name: 'authors', type: 'reference' },
        }}
        media={[]}
        referenceLabels={new Map([['authors/maria.md', 'Maria']])}
        repository={repository}
        value={['authors/maria.md', 'authors/bob.md']}
      />,
    )

    expect(html).toContain('Maria')
    expect(html).toContain('+1')
    expect(html).not.toContain('authors/bob.md')
  })
})
