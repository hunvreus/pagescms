import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { TestI18n } from '#/i18n/test-provider'
import { ContentEntryFieldsSkeleton } from './content-entry-skeleton'

vi.mock('#/client/queries/repository', () => ({
  repositoryQueryOptions: () => ({ queryKey: ['workspace'] }),
}))

it('shows schema labels without mounting editable controls or inventing list entries', () => {
  const html = renderToStaticMarkup(
    <TestI18n>
      <ContentEntryFieldsSkeleton
        fields={[
          { name: 'title', label: 'Page title', type: 'string' },
          {
            name: 'secret',
            label: 'Hidden label',
            type: 'string',
            hidden: true,
          },
          { name: 'body', label: 'Body', type: 'rich-text' },
          {
            name: 'people',
            label: 'People',
            type: 'object',
            list: true,
            fields: [{ name: 'name', label: 'Person name', type: 'string' }],
          },
        ]}
      />
    </TestI18n>,
  )
  expect(html).toContain('Page title')
  expect(html).toContain('People')
  expect(html).not.toContain('Person name')
  expect(html).not.toContain('Hidden label')
  expect(html).toContain('role="status"')
  expect(html).not.toMatch(/<input|<textarea|contenteditable/i)
  expect(html.match(/data-slot="skeleton"/g)).toHaveLength(5)
})
