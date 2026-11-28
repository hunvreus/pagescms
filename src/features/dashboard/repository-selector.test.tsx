import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  initialRepositoryAccount,
  RepositorySelector,
} from './repository-selector'

import type { RepositoryAccount } from '#/server/repository/repositories'

const state = vi.hoisted(() => ({
  data: undefined as
    Array<{ owner: string; repo: string; private: boolean }> | undefined,
  isPending: false,
  isFetching: false,
  queryEnabled: false,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled: boolean }) => {
    state.queryEnabled = enabled
    return {
      ...state,
      isSuccess: !state.isPending,
      isPlaceholderData: false,
    }
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('#/client/api/repository-search', () => ({
  searchRepositoryRepositories: vi.fn(),
}))

describe('initial project account', () => {
  const accounts: RepositoryAccount[] = [
    {
      login: 'another-user',
      installationId: 1,
      type: 'user',
      repositorySelection: 'selected',
    },
    {
      login: 'hunvreus',
      installationId: 2,
      type: 'user',
      repositorySelection: 'all',
    },
    {
      login: 'pagescms',
      installationId: 3,
      type: 'org',
      repositorySelection: 'all',
    },
  ]

  it('prefers the last project owner, including an organization', () => {
    expect(initialRepositoryAccount(accounts, 'hunvreus', 'PagesCMS')).toEqual(
      accounts[2],
    )
  })

  it('defaults to the signed-in personal account without history', () => {
    expect(initialRepositoryAccount(accounts, 'HUNVREUS')).toEqual(accounts[1])
  })

  it('falls back to the personal account if the last owner is unavailable', () => {
    expect(
      initialRepositoryAccount(accounts, 'hunvreus', 'removed-org'),
    ).toEqual(accounts[1])
  })

  it('uses the first available account when personal access is unavailable', () => {
    expect(initialRepositoryAccount(accounts, null, 'removed-org')).toEqual(
      accounts[0],
    )
  })

  it('has no selection when no accounts are available', () => {
    expect(initialRepositoryAccount([], 'hunvreus', 'pagescms')).toBeNull()
  })
})

describe('repository search loading', () => {
  const account: RepositoryAccount = {
    login: 'pagescms',
    installationId: 1,
    type: 'user',
    repositorySelection: 'all',
  }
  function render(selectedAccount: RepositoryAccount | null = account) {
    return renderToStaticMarkup(
      <TestI18n>
        {
          <RepositorySelector
            accounts={[account]}
            selectedAccount={selectedAccount}
            onAccountSelect={vi.fn()}
          />
        }
      </TestI18n>,
    )
  }
  it('does not fetch repositories until the account preference is resolved', () => {
    expect(render(null)).toContain('aria-label="Loading projects"')
    expect(state.queryEnabled).toBe(false)
    render()
    expect(state.queryEnabled).toBe(true)
  })
  it('keeps existing rows without a search spinner during background refresh', () => {
    Object.assign(state, {
      data: [{ owner: 'pagescms', repo: 'fixture', private: false }],
      isPending: false,
      isFetching: true,
    })
    const html = render()
    expect(html).toContain('fixture')
    expect(html).not.toContain('aria-label="Filtering repositories"')
    expect(html).toContain('aria-busy="false"')
    expect(html).not.toContain('aria-label="Loading repositories"')
  })
  it('uses skeleton rows only before the first results load', () => {
    Object.assign(state, { data: undefined, isPending: true, isFetching: true })
    const html = render()
    expect(html).toContain('aria-label="Loading repositories"')
    expect(html).not.toContain('aria-label="Filtering repositories"')
    expect(html).toMatch(/<input[^>]*disabled=""/)
  })
})
