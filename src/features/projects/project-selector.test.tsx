import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ProjectSelector } from './project-selector'

const state = vi.hoisted(() => ({
  data: undefined as
    Array<{ owner: string; repo: string; private: boolean }> | undefined,
  isPending: false,
  isFetching: false,
}))
vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: (data: unknown) => data,
  useQuery: () => ({
    ...state,
    isSuccess: !state.isPending,
    isPlaceholderData: false,
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('#/functions/projects', () => ({ getProjectRepositories: vi.fn() }))

describe('repository search loading', () => {
  function render() {
    return renderToStaticMarkup(
      <ProjectSelector
        accounts={[
          {
            login: 'pagescms',
            installationId: 1,
            type: 'user',
            repositorySelection: 'all',
          },
        ]}
      />,
    )
  }
  it('keeps existing rows and shows an inline spinner while fetching', () => {
    Object.assign(state, {
      data: [{ owner: 'pagescms', repo: 'fixture', private: false }],
      isPending: false,
      isFetching: true,
    })
    const html = render()
    expect(html).toContain('fixture')
    expect(html).toContain('aria-label="Filtering repositories"')
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('aria-label="Loading repositories"')
  })
  it('uses skeleton rows only before the first results load', () => {
    Object.assign(state, { data: undefined, isPending: true, isFetching: true })
    expect(render()).toContain('aria-label="Loading repositories"')
  })
  it('removes the spinner once fetching finishes', () => {
    Object.assign(state, { data: [], isPending: false, isFetching: false })
    expect(render()).not.toContain('aria-label="Filtering repositories"')
  })
})
