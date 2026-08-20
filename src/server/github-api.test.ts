import { describe, expect, it, vi } from 'vitest'

import { GitHubApiError, createGitHubApi } from './github-api.server'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

const repository = {
  owner: { login: 'PagesCMS' },
  name: 'pages-cms',
  private: false,
  default_branch: 'main',
  updated_at: '2026-08-20T00:00:00Z',
  permissions: { push: true },
}

describe('createGitHubApi', () => {
  it('uses one installation endpoint page until the reported total is met', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        total_count: 1,
        installations: [
          {
            id: 42,
            repository_selection: 'selected',
            account: { login: 'PagesCMS', type: 'Organization' },
          },
        ],
      }),
    )

    await expect(
      createGitHubApi('token', fetcher).listInstallations(),
    ).resolves.toEqual([
      {
        id: 42,
        repositorySelection: 'selected',
        account: { login: 'PagesCMS', type: 'Organization' },
      },
    ])
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('maps writable installation repositories without an SDK dependency', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ total_count: 1, repositories: [repository] }),
    )

    await expect(
      createGitHubApi('token', fetcher).listInstallationRepositories(42),
    ).resolves.toEqual([
      {
        owner: 'PagesCMS',
        name: 'pages-cms',
        private: false,
        defaultBranch: 'main',
        updatedAt: '2026-08-20T00:00:00Z',
        canPush: true,
      },
    ])
  })

  it('encodes search qualifiers and limits results to ten', async () => {
    let requestedUrl = ''
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input)
      return jsonResponse({ total_count: 1, items: [repository] })
    })

    await createGitHubApi('token', fetcher).searchRepositories({
      owner: 'PagesCMS',
      type: 'org',
      keyword: 'cms tools',
    })

    const url = new URL(requestedUrl)
    expect(url.searchParams.get('q')).toBe(
      'cms tools in:name org:PagesCMS fork:true',
    )
    expect(url.searchParams.get('per_page')).toBe('10')
  })

  it('surfaces GitHub status and retry metadata', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        { message: 'API rate limit exceeded' },
        { status: 403, headers: { 'retry-after': '30' } },
      ),
    )

    const error = await createGitHubApi('token', fetcher)
      .listInstallations()
      .catch((value: unknown) => value)

    expect(error).toBeInstanceOf(GitHubApiError)
    expect(error).toMatchObject({ status: 403, retryAfter: '30' })
  })

  it('loads repository metadata, branches, and encoded file refs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/branches')) {
        return jsonResponse([{ name: 'main' }, { name: 'feature/a' }])
      }
      if (url.pathname.includes('/contents/')) {
        return jsonResponse({
          type: 'file',
          sha: 'config-sha',
          content: 'dGVzdA==',
        })
      }
      return jsonResponse({
        id: 1,
        owner: { id: 2, login: 'PagesCMS' },
        name: 'pages-cms',
        default_branch: 'main',
        private: false,
      })
    })
    const api = createGitHubApi('token', fetcher)

    await expect(api.getRepository('PagesCMS', 'pages-cms')).resolves.toEqual({
      id: 1,
      owner: 'PagesCMS',
      ownerId: 2,
      repo: 'pages-cms',
      defaultBranch: 'main',
      private: false,
    })
    await expect(api.listBranches('PagesCMS', 'pages-cms')).resolves.toEqual([
      'main',
      'feature/a',
    ])
    await expect(
      api.getFile('PagesCMS', 'pages-cms', '.pages.yml', 'feature/a'),
    ).resolves.toEqual({ sha: 'config-sha', content: 'dGVzdA==' })

    const fileUrl = new URL(String(fetcher.mock.calls[2]?.[0]))
    expect(fileUrl.searchParams.get('ref')).toBe('feature/a')
  })
})
