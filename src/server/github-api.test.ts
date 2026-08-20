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
        permissions: { push: true },
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
      canPush: true,
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

  it('loads collection text and directories in one GraphQL request', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          variables: Record<string, string>
        }
        expect(body.variables).toEqual({
          owner: 'PagesCMS',
          repo: 'pages-cms',
          expression: 'main:content/posts',
        })
        return jsonResponse({
          data: {
            repository: {
              object: {
                entries: [
                  {
                    type: 'blob',
                    name: 'hello.md',
                    path: 'content/posts/hello.md',
                    object: {
                      text: '---\ntitle: Hello\n---',
                      oid: 'abc',
                      byteSize: 24,
                    },
                  },
                  {
                    type: 'tree',
                    name: 'archive',
                    path: 'content/posts/archive',
                    object: {},
                  },
                ],
              },
            },
          },
        })
      },
    )

    await expect(
      createGitHubApi('token', fetcher).getDirectory(
        'PagesCMS',
        'pages-cms',
        'main',
        'content/posts',
      ),
    ).resolves.toEqual([
      {
        type: 'file',
        name: 'hello.md',
        path: 'content/posts/hello.md',
        sha: 'abc',
        content: '---\ntitle: Hello\n---',
        size: 24,
      },
      {
        type: 'dir',
        name: 'archive',
        path: 'content/posts/archive',
        sha: null,
        content: null,
        size: null,
      },
    ])
  })

  it('updates files with optimistic SHA conflict protection', async () => {
    let requestBody: Record<string, unknown> = {}
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          content: { path: '.pages.yml', sha: 'new-sha' },
          commit: { sha: 'commit-sha' },
        })
      },
    )

    await expect(
      createGitHubApi('token', fetcher).putFile({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        path: '.pages.yml',
        content: 'Y29udGVudA==',
        message: 'Update .pages.yml',
        sha: 'old-sha',
      }),
    ).resolves.toEqual({
      path: '.pages.yml',
      sha: 'new-sha',
      commitSha: 'commit-sha',
    })
    expect(requestBody).toMatchObject({
      branch: 'main',
      sha: 'old-sha',
      content: 'Y29udGVudA==',
    })
  })

  it('deletes files with optimistic SHA conflict protection', async () => {
    let requestBody: Record<string, unknown> = {}
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE')
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({ commit: { sha: 'delete-commit' } })
      },
    )
    await expect(
      createGitHubApi('token', fetcher).deleteFile({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        path: 'content/post.md',
        sha: 'old-sha',
        message: 'Delete post',
      }),
    ).resolves.toEqual({ commitSha: 'delete-commit' })
    expect(requestBody).toMatchObject({
      branch: 'main',
      sha: 'old-sha',
      message: 'Delete post',
    })
  })

  it('renames a file in one history-preserving commit', async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = []
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        requests.push({
          url,
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })
        if (url.includes('/git/ref/')) {
          return jsonResponse({ object: { sha: 'head-sha' } })
        }
        if (url.includes('/git/trees/head-sha')) {
          return jsonResponse({
            sha: 'base-tree-sha',
            tree: [
              { path: 'content', mode: '040000', type: 'tree', sha: 'dir' },
              {
                path: 'content/old.md',
                mode: '100644',
                type: 'blob',
                sha: 'blob-sha',
              },
            ],
          })
        }
        if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' })
        if (url.endsWith('/git/commits')) {
          return jsonResponse({ sha: 'commit-sha' })
        }
        return jsonResponse({ object: { sha: 'commit-sha' } })
      },
    )
    await expect(
      createGitHubApi('token', fetcher).renameFile({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'feature/a',
        path: 'content/old.md',
        newPath: 'content/new.md',
        sha: 'blob-sha',
        message: 'Rename post',
      }),
    ).resolves.toMatchObject({
      newPath: 'content/new.md',
      commitSha: 'commit-sha',
    })
    expect(requests).toHaveLength(5)
    expect(requests[2]?.body).toEqual({
      base_tree: 'base-tree-sha',
      tree: [
        {
          path: 'content/old.md',
          mode: '100644',
          type: 'blob',
          sha: null,
        },
        {
          path: 'content/new.md',
          mode: '100644',
          type: 'blob',
          sha: 'blob-sha',
        },
      ],
    })
    expect(requests[3]?.body).toMatchObject({
      tree: 'tree-sha',
      parents: ['head-sha'],
    })
    expect(requests[4]).toMatchObject({ method: 'PATCH' })
  })
})
