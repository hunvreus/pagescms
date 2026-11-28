// @vitest-environment jsdom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { authenticationQueryOptions } from '#/client/queries/session'
import { TestI18n } from '#/i18n/test-provider'
import { CollectionTable } from './collection-table'
import { collectionViewModel } from './collection-model'

const readLabels = vi.hoisted(() =>
  vi.fn(async ({ selectedValues }: { selectedValues: string[] }) => ({
    options: selectedValues.map((value) => ({
      value,
      label: 'Label ' + value,
    })),
  })),
)
vi.mock('#/client/api/reference', () => ({ readReferenceOptions: readLabels }))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

it('requests only displayed reference labels when paging a collection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const client = new QueryClient()
  client.setQueryData([...authenticationQueryOptions().queryKey], {
    user: { id: 'u' },
  })
  const host = document.createElement('div')
  const root = createRoot(host)
  const fields = [
    { name: 'author', type: 'reference', options: { collection: 'authors' } },
  ]
  const view = { fields: ['author'] }
  const data = Array.from({ length: 26 }, (_, index) => {
    const name = String(index).padStart(2, '0')
    return {
      type: 'file' as const,
      path: 'posts/' + name,
      parentPath: 'posts',
      name,
      sha: name,
      isNode: false,
      fields: { author: [name, 'secondary'] },
    }
  })
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <TestI18n>
            <CollectionTable
              collection={{
                name: 'posts',
                label: 'Posts',
                groupTrail: [],
                path: 'posts',
                rootPath: 'posts',
                i18n: null,
                locale: null,
                localized: false,
                allowCustomMessage: false,
                primaryField: 'name',
                format: null,
                extension: null,
                filename: null,
                subfolders: true,
                fields,
                list: null,
                filenameField: false,
                view,
                operations: { create: true, rename: true, delete: true },
                actions: [],
              }}
              directory="posts"
              repository={{
                owner: 'o',
                repo: 'r',
                branch: 'main',
                name: 'posts',
              }}
              model={collectionViewModel({ fields, view })}
              media={[]}
              data={data}
              children={{}}
              loading={new Set()}
              canCreate={false}
              canRename={false}
              canDelete={false}
              canAddChild={() => false}
              onExpand={vi.fn()}
              onAddChild={vi.fn()}
              onRename={vi.fn()}
              onDelete={vi.fn()}
              search=""
              onSearchChange={vi.fn()}
            />
          </TestI18n>
        </QueryClientProvider>,
      ),
    )
    const first = readLabels.mock.calls[0][0].selectedValues
    expect(first).toHaveLength(25)
    expect(first).not.toContain('secondary')
    const remaining = data.find((entry) => !first.includes(entry.name))!.name
    const next = host.querySelector<HTMLElement>(
      '[aria-label="Go to next page"]',
    )!
    await act(async () => next.click())
    expect(readLabels.mock.calls.at(-1)?.[0].selectedValues).toEqual([
      remaining,
    ])
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.textContent).toContain('Label ' + remaining)
  } finally {
    await act(async () => root.unmount())
    client.clear()
    vi.unstubAllGlobals()
  }
})
