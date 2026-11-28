import { describe, expect, it, vi } from 'vitest'

import { GitHubApiError, createGitHubApi } from '#/server/github/api'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

const repository = {
  id: 10,
  owner: { id: 20, login: 'PagesCMS' },
  name: 'pages-cms',
  private: false,
  default_branch: 'main',
  updated_at: '2026-08-20T00:00:00Z',
  permissions: { push: true },
}

describe('createGitHubApi', () => {
  it('loads a directory and its commit in one ID-bound GraphQL request', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({
          data: {
            repository: {
              object: {
                oid: 'commit-sha',
                file: {
                  object: {
                    entries: [
                      {
                        name: 'a.md',
                        path: 'posts/a.md',
                        type: 'blob',
                        object: {
                          oid: 'blob-sha',
                          text: 'hello',
                          byteSize: 5,
                          isTruncated: false,
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
    )
    const api = createGitHubApi('token', fetcher, 15_000, 15_000, {
      id: 42,
      nodeId: 'node-42',
    })
    await expect(
      api.getDirectorySnapshot('old-owner', 'old-repo', 'main', 'posts'),
    ).resolves.toEqual({
      revision: 'commit-sha',
      entries: [
        {
          type: 'file',
          name: 'a.md',
          path: 'posts/a.md',
          sha: 'blob-sha',
          content: 'hello',
          size: 5,
          downloadUrl: null,
        },
      ],
    })
    expect(fetcher).toHaveBeenCalledOnce()
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request.variables).toEqual({
      nodeId: 'node-42',
      expression: 'refs/heads/main',
      path: 'posts',
    })
    expect(request.query).toContain('file(path: $path)')
  })

  it('loads a root directory and rejects a missing branch', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            repository: {
              object: {
                oid: 'head',
                tree: { entries: [] },
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { repository: { object: null } } }),
      )
    const api = createGitHubApi('token', fetcher)
    await expect(
      api.getDirectorySnapshot('owner', 'repo', 'main', ''),
    ).resolves.toEqual({ revision: 'head', entries: [] })
    await expect(
      api.getDirectorySnapshot('owner', 'repo', 'missing', ''),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns an empty directory when GitHub cannot resolve its path', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: { repository: { object: { oid: 'head', file: null } } },
        errors: [
          {
            message: "Could not resolve file for path 'missing'.",
            path: ['repository', 'object', 'file'],
          },
        ],
      }),
    )
    const api = createGitHubApi('token', fetcher)
    await expect(
      api.getDirectorySnapshot('owner', 'repo', 'main', 'missing'),
    ).resolves.toEqual({ revision: 'head', entries: [], missing: true })
    await expect(
      api.getDirectorySnapshot('owner', 'repo', 'main', 'other'),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('does not fall back to repository names when a bound node ID is missing', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const api = createGitHubApi('token', fetcher, 15_000, 15_000, { id: 42 })
    await expect(
      api.getDirectorySnapshot('owner', 'repo', 'main', 'posts'),
    ).rejects.toThrow('node ID is unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('drops metadata repopulated by a concurrent read during a fresh check', async () => {
    let finish!: (response: Response) => void
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(
        jsonResponse({ ...repository, permissions: { push: false } }),
      )
    const api = createGitHubApi('fresh-invalidation-concurrency', fetcher)
    await api.getRepository('PagesCMS', 'pages-cms')
    const fresh = api.getRepository('PagesCMS', 'pages-cms', { fresh: true })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect((await api.getRepository('PagesCMS', 'pages-cms')).canPush).toBe(
      true,
    )
    finish(jsonResponse({ ...repository, permissions: { push: false } }))
    expect((await fresh).canPush).toBe(false)
    expect((await api.getRepository('PagesCMS', 'pages-cms')).canPush).toBe(
      false,
    )
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('can bypass cached repository metadata for identity checks', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(repository))
      .mockResolvedValueOnce(jsonResponse({ ...repository, id: 11 }))
    const api = createGitHubApi('identity-fresh-test-token', fetcher)
    expect((await api.getRepository('PagesCMS', 'pages-cms')).id).toBe(10)
    expect(
      (await api.getRepository('PagesCMS', 'pages-cms', { fresh: true })).id,
    ).toBe(11)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

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

  it.each(['files', 'directory'] as const)(
    'keeps truncated directory text but loads full standalone file text for %s',
    async (kind) => {
      const text = 'title: café\nbody: complete'
      const blob = {
        text: 'title:',
        isTruncated: true,
        oid: 'immutable',
        byteSize: 27,
      }
      const fetcher = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith('/graphql'))
          return jsonResponse({
            data: {
              repository:
                kind === 'files'
                  ? { file0: blob }
                  : {
                      object: {
                        entries: [
                          {
                            type: 'blob',
                            name: 'post.yml',
                            path: 'post.yml',
                            object: blob,
                          },
                        ],
                      },
                    },
            },
          })
        expect(String(url)).toBe(
          'https://api.github.com/repos/owner/repo/git/blobs/immutable',
        )
        return jsonResponse({
          encoding: 'base64',
          content: Buffer.from(text).toString('base64'),
        })
      })
      const api = createGitHubApi('token', fetcher)
      const entries =
        kind === 'files'
          ? await api.getFiles('owner', 'repo', 'head', ['post.yml'])
          : await api.getDirectory('owner', 'repo', 'head', '')
      expect(entries[0]).toMatchObject({
        content: kind === 'files' ? text : 'title:',
        sha: 'immutable',
      })
      expect(fetcher).toHaveBeenCalledTimes(kind === 'files' ? 2 : 1)
    },
  )

  it('does not refetch truncated node files used in a listing', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: {
          repository: {
            file0: { oid: 'blob', text: 'partial', isTruncated: true },
          },
        },
      }),
    )
    const result = await createGitHubApi('token', fetcher).getFiles(
      'owner',
      'repo',
      'head',
      ['node.md'],
      true,
      true,
    )
    expect(result[0]).toMatchObject({ sha: 'blob', content: 'partial' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('rejects a truncated-text fallback failure instead of returning partial content', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/graphql')
        ? jsonResponse({
            data: {
              repository: {
                file0: { oid: 'blob', text: 'partial', isTruncated: true },
              },
            },
          })
        : jsonResponse({ message: 'Unavailable' }, { status: 503 }),
    )
    await expect(
      createGitHubApi('token', fetcher).getFiles('owner', 'repo', 'head', [
        'post.md',
      ]),
    ).rejects.toMatchObject({ status: 503 })
  })

  it('batches node files in large directories', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { variables } = JSON.parse(String(init?.body))
        if (variables.expression)
          return jsonResponse({
            data: {
              repository: {
                object: {
                  entries: Array.from({ length: 125 }, (_, i) => ({
                    type: 'tree',
                    name: String(i),
                    path: `posts/${i}`,
                    object: {},
                  })),
                },
              },
            },
          })
        const expressions = Object.keys(variables).filter((key) =>
          key.startsWith('exp'),
        )
        expect(expressions.length).toBeLessThanOrEqual(50)
        return jsonResponse({
          data: {
            repository: Object.fromEntries(
              expressions.map((key) => [
                key.replace('exp', 'file'),
                { oid: 'blob', text: 'body', byteSize: 4 },
              ]),
            ),
          },
        })
      },
    )
    const result = await createGitHubApi('token', fetcher).getDirectory(
      'owner',
      'repo',
      'head',
      'posts',
      'index.md',
    )
    expect(result).toHaveLength(250)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('preserves the status of a non-JSON GraphQL failure', async () => {
    const fetcher = vi.fn(
      async () => new Response('Unavailable', { status: 503 }),
    )
    await expect(
      createGitHubApi('token', fetcher).getFiles('owner', 'repo', 'head', [
        'post.md',
      ]),
    ).rejects.toMatchObject({ status: 503 })
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
        id: 10,
        ownerId: 20,
        owner: 'PagesCMS',
        name: 'pages-cms',
        private: false,
        defaultBranch: 'main',
        updatedAt: '2026-08-20T00:00:00Z',
        canPush: true,
      },
    ])
  })

  it('reads all installation and repository pages beyond twenty', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const request = new URL(String(url))
      const page = Number(request.searchParams.get('page'))
      return request.pathname.endsWith('/repositories')
        ? jsonResponse({
            total_count: 21,
            repositories: [{ ...repository, id: page }],
          })
        : jsonResponse({
            total_count: 21,
            installations: [
              {
                id: page,
                repository_selection: 'selected',
                account: { login: 'owner', type: 'User' },
              },
            ],
          })
    })
    const api = createGitHubApi('token', fetcher)
    expect(await api.listInstallations()).toHaveLength(21)
    expect(await api.listInstallationRepositories(42)).toHaveLength(21)
  })

  it.each([
    { type: 'user' as const, keyword: 'cms tools' },
    { type: 'org' as const, keyword: '  cms tools  ' },
    { type: 'org' as const, keyword: '' },
  ])(
    'searches GitHub by name within the $type account ($keyword)',
    async (input) => {
      const fetcher = vi.fn(
        async (request: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(request))
          expect(url.pathname).toBe('/search/repositories')
          expect(Object.fromEntries(url.searchParams)).toEqual({
            q: `${input.keyword.trim()} in:name ${input.type}:PagesCMS fork:true`,
            sort: 'updated',
            order: 'desc',
            per_page: '10',
          })
          expect(new Headers(init?.headers).get('authorization')).toBe(
            'Bearer token',
          )
          return jsonResponse({ total_count: 1, items: [repository] })
        },
      )
      await expect(
        createGitHubApi('token', fetcher).searchRepositories({
          owner: 'PagesCMS',
          ...input,
        }),
      ).resolves.toMatchObject([{ name: 'pages-cms' }])
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )

  it('surfaces search failures without falling back to repository enumeration', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ message: 'Search unavailable' }, { status: 503 }),
    )
    await expect(
      createGitHubApi('token', fetcher).searchRepositories({
        owner: 'PagesCMS',
        type: 'org',
        keyword: 'cms',
      }),
    ).rejects.toMatchObject({ message: 'Search unavailable', status: 503 })
    expect(fetcher).toHaveBeenCalledOnce()
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
      .mockResolvedValueOnce(
        Response.json({
          ref: 'refs/heads/feature/a',
          object: { sha: 'a'.repeat(40) },
        }),
      )
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
      '/git/ref/heads/feature/a',
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

  it('opens a zero-byte file without a fallback request', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        sha: 'empty',
        size: 0,
        encoding: 'base64',
        content: '',
      }),
    )
    await expect(
      createGitHubApi('token', fetcher).getFile(
        'owner',
        'repo',
        'empty.md',
        'main',
      ),
    ).resolves.toEqual({ sha: 'empty', content: '' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('converts a rate-limit reset timestamp to seconds remaining', async () => {
    const reset = Math.floor(Date.now() / 1000) + 60
    const fetcher = vi.fn(async () =>
      jsonResponse(
        { message: 'Rate limit exceeded' },
        {
          status: 403,
          headers: {
            'x-ratelimit-reset': String(reset),
            'x-ratelimit-remaining': '0',
          },
        },
      ),
    )
    await expect(
      createGitHubApi('token', fetcher).getFile(
        'owner',
        'repo',
        'post.md',
        'main',
      ),
    ).rejects.toMatchObject({ retryAfter: expect.stringMatching(/^(59|60)$/) })
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
          exp0: 'main:content/guides/index.md',
          exp1: 'main:content/empty/index.md',
        })
        return jsonResponse({
          data: {
            repository: {
              file0: {
                text: '---\ntitle: Guides\n---',
                oid: 'node-sha',
                byteSize: 24,
              },
              file1: null,
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
      if (url.pathname.includes('/git/ref/'))
        return jsonResponse({ object: { sha: 'head-sha' } })
      expect(url.pathname).toBe(
        '/repos/PagesCMS/pages-cms/contents/public/files',
      )
      expect(url.searchParams.get('ref')).toBe('head-sha')
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
        revision: 'head-sha',
        name: 'photo.jpg',
        path: 'public/files/photo.jpg',
        sha: 'photo-sha',
        content: null,
        size: 2048,
        downloadUrl: 'https://raw.example/photo.jpg?token=temporary',
      },
      {
        type: 'dir',
        revision: 'head-sha',
        name: 'archive',
        path: 'public/files/archive',
        sha: null,
        content: null,
        size: null,
        downloadUrl: null,
      },
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('updates files with optimistic SHA conflict protection', async () => {
    let requestBody: Record<string, unknown> = {}
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          content: { path: '.pages.yml', sha: 'new-sha' },
          commit: {
            sha: 'commit-sha',
            committer: { date: '2026-10-12T10:00:00Z' },
          },
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
      commitTimestamp: '2026-10-12T10:00:00.000Z',
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
        return jsonResponse({
          commit: {
            sha: 'delete-commit',
            committer: { date: '2026-10-12T11:00:00Z' },
          },
        })
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
    ).resolves.toEqual({
      commitSha: 'delete-commit',
      commitTimestamp: '2026-10-12T11:00:00.000Z',
    })
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
            truncated: false,
            tree: [
              { path: 'content', mode: '040000', type: 'tree', sha: 'dir' },
            ],
          })
        }
        if (url.endsWith('/git/trees/dir')) {
          return jsonResponse({
            sha: 'dir',
            truncated: false,
            tree: [
              {
                path: 'old.md',
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
    expect(requests).toHaveLength(6)
    expect(requests[3]?.body).toEqual({
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
    expect(requests[4]?.body).toMatchObject({
      tree: 'tree-sha',
      parents: ['head-sha'],
    })
    expect(requests[5]).toMatchObject({ method: 'PATCH' })
  })

  it.each(['truncated', 'collision', 'changed'] as const)(
    'does not write a rename when its tree is %s',
    async (failure) => {
      const fetcher = vi.fn(
        async (url: RequestInfo | URL, init?: RequestInit) => {
          expect(init?.method ?? 'GET').toBe('GET')
          expect(String(url)).not.toContain('recursive=')
          if (String(url).includes('/git/ref/'))
            return jsonResponse({ object: { sha: 'head' } })
          return jsonResponse({
            sha: 'root',
            truncated: failure === 'truncated',
            tree: [
              {
                path: 'old.md',
                mode: '100644',
                type: 'blob',
                sha: failure === 'changed' ? 'different' : 'blob',
              },
              ...(failure === 'collision'
                ? [
                    {
                      path: 'new.md',
                      type: 'blob',
                      sha: 'other',
                      mode: '100644',
                    },
                  ]
                : []),
            ],
          })
        },
      )
      await expect(
        createGitHubApi('token', fetcher).renameFile({
          owner: 'owner',
          repo: 'repo',
          branch: 'main',
          path: 'old.md',
          newPath: 'new.md',
          sha: 'blob',
          message: 'Rename',
        }),
      ).rejects.toThrow(
        failure === 'truncated'
          ? 'incomplete'
          : failure === 'collision'
            ? 'already exists'
            : 'changed',
      )
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )

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
    expect(url.searchParams.get('per_page')).toBe('10')
    expect(url.searchParams.get('page')).toBe('1')
    await createGitHubApi('token', fetcher).listFileCommits(
      'PagesCMS',
      'pages-cms',
      'feature/a',
      'content/hello world.md',
      3,
    )
    expect(new URL(requestedUrl).searchParams.get('page')).toBe('3')
  })
})

describe('atomic translation renames', () => {
  it.each(['success', 'stale-head', 'stale-file', 'collision'] as const)(
    'commits all translations or none: %s',
    async (failure) => {
      const writes: { path: string; body: Record<string, unknown> }[] = []
      const fetcher = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(String(input)).pathname
          if ((init?.method ?? 'GET') !== 'GET')
            writes.push({
              path,
              body: JSON.parse(String(init?.body)) as Record<string, unknown>,
            })
          if (path.includes('/git/ref/'))
            return jsonResponse({
              object: { sha: failure === 'stale-head' ? 'head-2' : 'head' },
            })
          if (path.endsWith('/git/trees/head'))
            return jsonResponse({
              sha: 'root',
              truncated: false,
              tree: [
                {
                  path: 'about.json',
                  mode: '100644',
                  type: 'blob',
                  sha: 'en-sha',
                },
                {
                  path: 'about.fr.json',
                  mode: '100644',
                  type: 'blob',
                  sha: failure === 'stale-file' ? 'changed' : 'fr-sha',
                },
                ...(failure === 'collision'
                  ? [
                      {
                        path: 'contact.fr.json',
                        mode: '100644',
                        type: 'blob',
                        sha: 'other',
                      },
                    ]
                  : []),
              ],
            })
          if (path.endsWith('/git/trees'))
            return jsonResponse({ sha: 'new-tree' })
          if (path.endsWith('/git/commits'))
            return jsonResponse({ sha: 'new-commit' })
          return jsonResponse({ object: { sha: 'new-commit' } })
        },
      )
      const request = createGitHubApi('test-token', fetcher).renameFile({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        path: 'about.json',
        newPath: 'contact.json',
        sha: 'en-sha',
        expectedHead: 'head',
        moves: [
          { path: 'about.json', newPath: 'contact.json', sha: 'en-sha' },
          { path: 'about.fr.json', newPath: 'contact.fr.json', sha: 'fr-sha' },
        ],
        message: 'Rename translations',
      })
      if (failure !== 'success') {
        await expect(request).rejects.toBeInstanceOf(GitHubApiError)
        expect(writes).toHaveLength(0)
      } else {
        await expect(request).resolves.toMatchObject({
          commitSha: 'new-commit',
        })
        expect(writes).toHaveLength(3)
        expect(writes[0].body.tree).toEqual([
          { path: 'about.json', mode: '100644', type: 'blob', sha: null },
          { path: 'contact.json', mode: '100644', type: 'blob', sha: 'en-sha' },
          { path: 'about.fr.json', mode: '100644', type: 'blob', sha: null },
          {
            path: 'contact.fr.json',
            mode: '100644',
            type: 'blob',
            sha: 'fr-sha',
          },
        ])
        expect(writes[2].body).toEqual({ sha: 'new-commit', force: false })
      }
    },
  )
})

it('reuses the navigation branch SHA for media delivery but reads a fresh SHA for writes', async () => {
  const head = 'a'.repeat(40)
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/git/ref/heads/'))
      return Response.json({ object: { sha: head } })
    if (url.includes('/contents/'))
      return Response.json([
        {
          type: 'file',
          name: 'a.png',
          path: 'images/a.png',
          sha: 'blob',
          size: 4,
          download_url: 'https://raw.githubusercontent.com/o/r/a/images/a.png',
        },
      ])
    throw new Error('Unexpected request')
  })
  const api = createGitHubApi('shared-branch-snapshot', fetcher as typeof fetch)
  expect(await api.branchExists('o', 'r', 'main')).toBe(true)
  const second = createGitHubApi(
    'shared-branch-snapshot',
    fetcher as typeof fetch,
  )
  await second.getMediaDirectory('o', 'r', 'main', 'images')
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(String(fetcher.mock.calls[1][0])).toContain(`ref=${head}`)
  await second.getRefSha('o', 'r', 'main')
  expect(fetcher).toHaveBeenCalledTimes(3)
})
it('addresses a bound repository by ID for REST and GraphQL reads', async () => {
  const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
    String(url).endsWith('/graphql')
      ? Response.json({ data: { repository: { object: { entries: [] } } } })
      : Response.json({ type: 'file', sha: 'sha', content: btoa('hello') }),
  )
  const api = createGitHubApi('token', fetcher, 0, 0, {
    id: 42,
    nodeId: 'node-42',
  })
  await api.getFile('old-owner', 'old-name', 'file.md', 'main')
  expect(String(fetcher.mock.calls[0][0])).toContain(
    '/repositories/42/contents/file.md',
  )
  await api.getDirectory('old-owner', 'old-name', 'main', 'posts')
  const body = JSON.parse(String(fetcher.mock.calls[1][1]?.body))
  expect(body.variables).toMatchObject({
    nodeId: 'node-42',
    expression: 'main:posts',
  })
  expect(body.query).toContain('repository: node(id: $nodeId)')
  expect(body.query).not.toContain('repository(owner:')
})

it('fails a bound read without falling back to the repository name', async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL) =>
    Response.json({ message: 'not found' }, { status: 404 }),
  )
  const api = createGitHubApi('token', fetcher, 0, 0, {
    id: 42,
    nodeId: 'node-42',
  })
  await expect(
    api.getFile('owner', 'name', 'file.md', 'main'),
  ).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledOnce()
  expect(String(fetcher.mock.calls[0][0])).toContain('/repositories/42/')
})
