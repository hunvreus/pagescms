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
  it('fetches 1,000 changed files in 20 revision-pinned GraphQL batches', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { variables } = JSON.parse(String(init?.body))
        const files = Object.entries(variables).filter(([key]) =>
          key.startsWith('exp'),
        )
        expect(files.length).toBeLessThanOrEqual(50)
        expect(
          files.every(([, expression]) =>
            String(expression).startsWith('commit-sha:'),
          ),
        ).toBe(true)
        return jsonResponse({
          data: {
            repository: Object.fromEntries(
              files.map(([key]) => [
                key.replace('exp', 'file'),
                { text: 'body', oid: 'blob-sha', byteSize: 4 },
              ]),
            ),
          },
        })
      },
    )
    const files = await createGitHubApi('token', fetcher).getFiles(
      'owner',
      'repo',
      'commit-sha',
      Array.from({ length: 1_000 }, (_, i) => `posts/${i}.md`),
    )
    expect(fetcher).toHaveBeenCalledTimes(20)
    expect(files).toHaveLength(1_000)
    expect(files[0]).toMatchObject({
      path: 'posts/0.md',
      content: 'body',
      sha: 'blob-sha',
    })
  })

  it('rejects partial GraphQL batches instead of publishing an incomplete cache', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: {
          repository: { file0: { text: 'body', oid: 'blob', byteSize: 4 } },
        },
        errors: [{ message: 'Rate limit exceeded' }],
      }),
    )
    await expect(
      createGitHubApi('token', fetcher).getFiles('owner', 'repo', 'commit', [
        'post.md',
      ]),
    ).rejects.toThrow('Rate limit exceeded')
  })

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
    expect(url.searchParams.get('per_page')).toBe('5')
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

  it('lists every branch beyond the former twenty-page limit', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      const offset = (page - 1) * 100
      return Response.json(
        Array.from({ length: Math.min(100, 2101 - offset) }, (_, index) => ({
          name: `branch-${offset + index}`,
        })),
      )
    })
    const api = createGitHubApi('all-branches', fetcher, 0)
    const branches = await api.listBranches('owner', 'repo')
    expect(branches).toHaveLength(2101)
    expect(branches.at(-1)).toBe('branch-2100')
    expect(fetcher).toHaveBeenCalledTimes(22)
  })

  it('checks one encoded branch and distinguishes missing branches from upstream failures', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ name: 'feature/a' }))
      .mockResolvedValueOnce(
        Response.json({ message: 'missing' }, { status: 404 }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: 'rate limited' }, { status: 403 }),
      )
    const api = createGitHubApi('branch-check', fetcher, 0)
    await expect(api.branchExists('owner', 'repo', 'feature/a')).resolves.toBe(
      true,
    )
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/branches/feature%2Fa',
    )
    await expect(api.branchExists('owner', 'repo', 'missing')).resolves.toBe(
      false,
    )
    await expect(
      api.branchExists('owner', 'repo', 'main'),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('streams raw previews and forwards conditional requests without JSON or blob decoding', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('image'))
        controller.close()
      },
    })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(body, { headers: { etag: '"revision"' } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 304, headers: { etag: '"revision"' } }),
      )
    const api = createGitHubApi('media-preview', fetcher)
    const response = await api.getFileResponse(
      'owner',
      'repo',
      'images/photo.png',
      'feature/a',
    )
    expect(response.body).toBe(body)
    expect(await response.text()).toBe('image')
    const cached = await api.getFileResponse(
      'owner',
      'repo',
      'images/photo.png',
      'feature/a',
      '"revision"',
    )
    expect(cached.status).toBe(304)
    expect(cached.body).toBeNull()
    const headers = new Headers(fetcher.mock.calls[1]?.[1]?.headers)
    expect(headers.get('if-none-match')).toBe('"revision"')
    expect(headers.get('accept')).toBe('application/vnd.github.raw')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('loads file content from the Git blob endpoint when Contents omits it', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.includes('/contents/')) {
        return jsonResponse({
          type: 'file',
          sha: 'large-image-sha',
          content: '',
          encoding: 'none',
        })
      }
      expect(url.pathname).toBe(
        '/repos/PagesCMS/pages-cms/git/blobs/large-image-sha',
      )
      return jsonResponse({
        sha: 'large-image-sha',
        content: 'aW1hZ2U=',
        encoding: 'base64',
      })
    })

    await expect(
      createGitHubApi('token', fetcher).getFile(
        'PagesCMS',
        'pages-cms',
        'public/files/photo.jpg',
        'main',
      ),
    ).resolves.toEqual({
      sha: 'large-image-sha',
      content: 'aW1hZ2U=',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('creates a branch from an existing ref', async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/git/ref/heads/main')) {
          return jsonResponse({ object: { sha: 'source-sha' } })
        }
        expect(url.pathname).toMatch(/\/git\/refs$/)
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          ref: 'refs/heads/feature/editor',
          sha: 'source-sha',
        })
        return jsonResponse({ object: { sha: 'source-sha' } })
      },
    )

    await expect(
      createGitHubApi('token', fetcher).createBranch(
        'PagesCMS',
        'pages-cms',
        'feature/editor',
        'main',
      ),
    ).resolves.toEqual({ branch: 'feature/editor', sha: 'source-sha' })
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
        downloadUrl: null,
      },
      {
        type: 'dir',
        name: 'archive',
        path: 'content/posts/archive',
        sha: null,
        content: null,
        size: null,
        downloadUrl: null,
      },
    ])
  })

  it('loads configured node files for child directories in one extra request', async () => {
    let request = 0
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        request += 1
        const body = JSON.parse(String(init?.body)) as {
          variables: Record<string, string>
        }
        if (request === 1) {
          return jsonResponse({
            data: {
              repository: {
                object: {
                  entries: [
                    {
                      type: 'tree',
                      name: 'guides',
                      path: 'content/guides',
                      object: {},
                    },
                    {
                      type: 'tree',
                      name: 'empty',
                      path: 'content/empty',
                      object: {},
                    },
                  ],
                },
              },
            },
          })
        }
        expect(body.variables).toMatchObject({
          node0: 'main:content/guides/index.md',
          node1: 'main:content/empty/index.md',
        })
        return jsonResponse({
          data: {
            repository: {
              node0: {
                text: '---\ntitle: Guides\n---',
                oid: 'node-sha',
                byteSize: 24,
              },
              node1: null,
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
        'content',
        'index.md',
      ),
    ).resolves.toContainEqual({
      type: 'file',
      name: 'index.md',
      path: 'content/guides/index.md',
      sha: 'node-sha',
      content: '---\ntitle: Guides\n---',
      size: 24,
      downloadUrl: null,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('loads a media directory and preserves GitHub download URLs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe(
        '/repos/PagesCMS/pages-cms/contents/public/files',
      )
      expect(url.searchParams.get('ref')).toBe('feature/media')
      return jsonResponse([
        {
          type: 'file',
          name: 'photo.jpg',
          path: 'public/files/photo.jpg',
          sha: 'photo-sha',
          size: 2048,
          download_url: 'https://raw.example/photo.jpg?token=temporary',
        },
        {
          type: 'dir',
          name: 'archive',
          path: 'public/files/archive',
          sha: 'directory-sha',
          size: 0,
          download_url: null,
        },
      ])
    })

    await expect(
      createGitHubApi('token', fetcher).getMediaDirectory(
        'PagesCMS',
        'pages-cms',
        'feature/media',
        'public/files',
      ),
    ).resolves.toEqual([
      {
        type: 'file',
        name: 'photo.jpg',
        path: 'public/files/photo.jpg',
        sha: 'photo-sha',
        content: null,
        size: 2048,
        downloadUrl: 'https://raw.example/photo.jpg?token=temporary',
      },
      {
        type: 'dir',
        name: 'archive',
        path: 'public/files/archive',
        sha: null,
        content: null,
        size: null,
        downloadUrl: null,
      },
    ])
    expect(fetcher).toHaveBeenCalledOnce()
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

  it('resolves branch and tag references while accepting commit SHAs', async () => {
    const requests: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url.includes('/git/ref/heads/release/next')) {
        return jsonResponse({ message: 'Not Found' }, { status: 404 })
      }
      return jsonResponse({ object: { sha: 'resolved-sha' } })
    })
    const api = createGitHubApi('token', fetcher)

    await expect(
      api.getRefSha('PagesCMS', 'pages-cms', 'release/next'),
    ).resolves.toBe('resolved-sha')
    expect(requests).toHaveLength(2)
    expect(requests[1]).toContain('/git/ref/tags/release/next')

    const sha = 'a'.repeat(40)
    await expect(api.getRefSha('PagesCMS', 'pages-cms', sha)).resolves.toBe(sha)
    expect(requests).toHaveLength(2)
  })

  it('dispatches workflows with the configured ref and payload input', async () => {
    let request: { url?: string; method?: string; body?: unknown } = {}
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        request = {
          url: String(input),
          method: init?.method,
          body: JSON.parse(String(init?.body)),
        }
        return new Response(null, { status: 204 })
      },
    )

    await createGitHubApi('token', fetcher).dispatchWorkflow({
      owner: 'PagesCMS',
      repo: 'pages-cms',
      workflow: 'deploy.yml',
      ref: 'main',
      inputs: { payload: '{"source":"pages-cms"}' },
    })

    expect(request).toEqual({
      url: 'https://api.github.com/repos/PagesCMS/pages-cms/actions/workflows/deploy.yml/dispatches',
      method: 'POST',
      body: {
        ref: 'main',
        inputs: { payload: '{"source":"pages-cms"}' },
      },
    })
  })

  it('creates a repository from an approved template', async () => {
    let request: { url?: string; method?: string; body?: unknown } = {}
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        request = {
          url: String(input),
          method: init?.method,
          body: JSON.parse(String(init?.body)),
        }
        return jsonResponse({
          owner: { login: 'PagesCMS' },
          name: 'my-blog',
          default_branch: 'main',
        })
      },
    )

    await expect(
      createGitHubApi('token', fetcher).createRepositoryFromTemplate({
        templateOwner: 'pagescms',
        templateRepo: 'astro-blog-template',
        owner: 'PagesCMS',
        repo: 'my-blog',
      }),
    ).resolves.toEqual({
      owner: 'PagesCMS',
      repo: 'my-blog',
      defaultBranch: 'main',
    })
    expect(request).toEqual({
      url: 'https://api.github.com/repos/pagescms/astro-blog-template/generate',
      method: 'POST',
      body: { owner: 'PagesCMS', name: 'my-blog' },
    })
  })

  it('lists, loads, and cancels workflow runs without an SDK', async () => {
    const requests: Array<{ url: string; method: string }> = []
    const workflowRun = {
      id: 72,
      status: 'in_progress',
      conclusion: null,
      html_url: 'https://github.com/PagesCMS/pages-cms/actions/runs/72',
      created_at: '2026-08-20T01:00:00Z',
      updated_at: '2026-08-20T01:01:00Z',
    }
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        requests.push({ url, method: init?.method ?? 'GET' })
        if (url.includes('/workflows/')) {
          return jsonResponse({ workflow_runs: [workflowRun] })
        }
        if (url.endsWith('/cancel')) return new Response(null, { status: 202 })
        return jsonResponse(workflowRun)
      },
    )
    const api = createGitHubApi('token', fetcher)

    await expect(
      api.listWorkflowRuns({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        workflow: 'deploy.yml',
        ref: 'feature/a',
      }),
    ).resolves.toEqual([
      {
        id: 72,
        status: 'in_progress',
        conclusion: null,
        htmlUrl: 'https://github.com/PagesCMS/pages-cms/actions/runs/72',
        createdAt: '2026-08-20T01:00:00Z',
        updatedAt: '2026-08-20T01:01:00Z',
      },
    ])
    const listUrl = new URL(requests[0]?.url ?? '')
    expect(listUrl.searchParams.get('branch')).toBe('feature/a')
    expect(listUrl.searchParams.get('event')).toBe('workflow_dispatch')

    await expect(
      api.getWorkflowRun('PagesCMS', 'pages-cms', 72),
    ).resolves.toMatchObject({ id: 72, status: 'in_progress' })
    await api.cancelWorkflowRun('PagesCMS', 'pages-cms', 72)
    expect(requests.at(-1)).toMatchObject({ method: 'POST' })
  })

  it('loads normalized file history with encoded branch and path filters', async () => {
    let requestedUrl = ''
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input)
      return jsonResponse([
        {
          sha: 'commit-sha',
          html_url: 'https://github.com/PagesCMS/pages-cms/commit/commit-sha',
          commit: {
            message: 'Update post',
            author: { name: 'Ada', date: '2026-08-20T00:00:00Z' },
          },
          author: { login: 'ada' },
        },
      ])
    })

    await expect(
      createGitHubApi('token', fetcher).listFileCommits(
        'PagesCMS',
        'pages-cms',
        'feature/a',
        'content/hello world.md',
      ),
    ).resolves.toEqual([
      {
        sha: 'commit-sha',
        url: 'https://github.com/PagesCMS/pages-cms/commit/commit-sha',
        message: 'Update post',
        authorName: 'Ada',
        authorLogin: 'ada',
        authoredAt: '2026-08-20T00:00:00Z',
      },
    ])
    const url = new URL(requestedUrl)
    expect(url.searchParams.get('sha')).toBe('feature/a')
    expect(url.searchParams.get('path')).toBe('content/hello world.md')
  })
})
