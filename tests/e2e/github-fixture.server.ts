import { appendFileSync } from 'node:fs'

export const configuration = `
actions:
  - name: deploy
    label: Deploy site
    workflow: deploy.yml
    ref: current
    confirm:
      title: Deploy site?
      message: This will trigger the deployment workflow.
      button: Deploy
media: public/images
content:
  - name: groups
    label: Groups
    type: file
    path: content/groups.json
    fields:
      - name: authors
        label: Authors
        type: object
        readonly: true
        list:
          collapsible:
            collapsed: true
        fields:
          - name: name
            label: Full name
            type: string
            required: true
      - name: layout
        type: block
        required: true
        list:
          collapsible:
            collapsed: true
        blocks:
          - name: widget
            label: Widget
            fields:
              - name: body
                label: Body
                type: rich-text
  - name: posts
    label: Posts
    type: collection
    path: content/posts
    filename: '{primary}.md'
    actions:
      - name: entry-test
        label: Test entry action
        workflow: entry-test.yml
        scope: entry
    fields:
      - name: title
        label: Title
        type: string
      - name: image
        label: Image
        type: image
      - name: body
        label: Body
        type: rich-text
  - name: code
    label: Code
    type: file
    path: content/code.json
    fields:
      - name: script
        label: Script
        type: code
        options:
          format: ts
      - name: locked
        label: Locked code
        type: code
        readonly: true
        options:
          format: json
  - name: raw-code
    label: Raw code
    type: file
    path: content/raw.ts
  - name: field-parity
    label: Field parity
    type: file
    path: content/field-parity.json
    fields:
      - name: status
        label: Status
        type: select
        options:
          placeholder: Choose status
          values:
            - name: draft
              label: Draft
            - name: published
              label: Published
      - name: date
        label: Date
        type: date
        options:
          format: dd/MM/yyyy
      - name: files
        label: Files
        type: file
        options:
          multiple: true
          rename: safe
`

const initialFiles = new Map([
  [
    'content/groups.json',
    {
      content: JSON.stringify({
        authors: [{ name: 'Ronan' }],
        layout: [{ _block: 'widget', body: 'Hello' }],
      }),
      sha: 'groups-sha-1',
    },
  ],
  [
    'content/field-parity.json',
    {
      content: JSON.stringify({
        status: 'draft',
        date: '02/10/2026',
        files: ['public/images/parity-a.txt', 'public/images/parity-b.txt'],
      }),
      sha: 'parity-sha-1',
    },
  ],
  ['public/images/parity-a.txt', { content: 'A', sha: 'parity-media-a' }],
  ['public/images/parity-b.txt', { content: 'B', sha: 'parity-media-b' }],
  [
    'content/raw.ts',
    { content: 'const original: number = 42', sha: 'raw-code-sha-1' },
  ],
  ['.pages.yml', { content: configuration, sha: 'config-sha' }],
  [
    'content/code.json',
    {
      content: JSON.stringify({
        script: 'const answer: number = 42',
        locked: '{"locked":true}',
      }),
      sha: 'code-sha-1',
    },
  ],
  [
    'content/posts/hello.md',
    {
      content: '---\ntitle: Hello world\n---\nWelcome to Pages CMS.\n',
      sha: 'entry-sha-1',
    },
  ],
  [
    'public/images/hero.svg',
    {
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="red"/></svg>',
      sha: 'media-sha-1',
    },
  ],
  [
    'public/images/cover.svg',
    {
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="blue"/></svg>',
      sha: 'media-sha-2',
    },
  ],
  [
    'public/images/Library/nested.svg',
    {
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="green"/></svg>',
      sha: 'media-sha-3',
    },
  ],
])

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fixtureRepositories = [
  'fixture',
  'private-fixture',
  'performance-fixture',
  'private-performance-fixture',
] as const

function isFixtureRepository(value: string) {
  return fixtureRepositories.includes(
    value as (typeof fixtureRepositories)[number],
  )
}

function repository(name = 'fixture') {
  const id = fixtureRepositories.indexOf(
    name as (typeof fixtureRepositories)[number],
  )
  return {
    id: id + 1,
    name,
    private: name.startsWith('private-'),
    default_branch: 'main',
    updated_at: '2026-08-20T00:00:00Z',
    owner: { id: 1, login: 'pagescms' },
    permissions: { push: true },
  }
}

function encoded(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function createGitHubFixtureFetch(metricsPath?: string): typeof fetch {
  const files = new Map(
    [...initialFiles].map(([path, file]) => [path, { ...file }]),
  )
  function directEntries(path: string) {
    const prefix = path ? `${path}/` : ''
    const directories = new Set<string>()
    const entries = [...files.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .flatMap(([name, file]) => {
        const remainder = name.slice(prefix.length)
        if (!remainder) return []
        if (remainder.includes('/')) {
          directories.add(remainder.split('/')[0])
          return []
        }
        return [
          {
            name: remainder,
            path: name,
            type: 'blob',
            object: {
              text: file.content,
              oid: file.sha,
              byteSize: file.content.length,
            },
          },
        ]
      })
    return [
      ...[...directories].map((name) => ({
        name,
        path: `${prefix}${name}`,
        type: 'tree',
        object: null,
      })),
      ...entries,
    ]
  }

  function restEntries(path: string, repositoryName: string) {
    const performanceDirectory = /^public\/images\/perf-\d+$/.test(path)
    if (performanceDirectory) {
      return ['hero.svg', 'cover.svg'].map((name, index) => ({
        name,
        path: `${path}/${name}`,
        type: 'file',
        sha: `performance-media-sha-${index + 1}`,
        size: 128,
        download_url: `http://127.0.0.1:3100/favicon.svg?asset=${encodeURIComponent(`${repositoryName}/${path}/${name}`)}`,
      }))
    }

    const prefix = path ? `${path}/` : ''
    const directories = new Set<string>()
    const entries = [...files.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .flatMap(([name, file]) => {
        const remainder = name.slice(prefix.length)
        if (!remainder) return []
        if (remainder.includes('/')) {
          directories.add(remainder.split('/')[0])
          return []
        }
        return [
          {
            name: remainder,
            path: name,
            type: 'file',
            sha: file.sha,
            size: file.content.length,
            download_url: `http://127.0.0.1:3100/favicon.svg?asset=${encodeURIComponent(`${repositoryName}/${name}`)}`,
          },
        ]
      })
    return [
      ...[...directories].map((name) => ({
        name,
        path: `${prefix}${name}`,
        type: 'dir',
        sha: `directory-${name}`,
        size: 0,
        download_url: null,
      })),
      ...entries,
    ]
  }

  function recordRequest(method: string, url: URL) {
    if (
      !/^\/repos\/pagescms\/(?:fixture|private-fixture|performance-fixture|private-performance-fixture)\/contents\/public\/images(?:\/|$)/.test(
        url.pathname,
      )
    )
      return
    if (!metricsPath) return
    appendFileSync(
      metricsPath,
      `${JSON.stringify({ method, path: url.pathname, search: url.search })}\n`,
    )
  }

  return async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    const method = init?.method ?? 'GET'
    recordRequest(method, url)

    if (url.pathname === '/user/installations') {
      return json({
        total_count: 1,
        installations: [
          {
            id: 1,
            repository_selection: 'selected',
            account: { login: 'pagescms', type: 'Organization' },
          },
        ],
      })
    }
    if (url.pathname === '/user/installations/1/repositories') {
      return json({
        total_count: fixtureRepositories.length,
        repositories: fixtureRepositories.map((name) => repository(name)),
      })
    }
    const repositoryMatch = url.pathname.match(
      /^\/repos\/pagescms\/([^/]+)(?:\/(.*))?$/,
    )
    const repositoryName = repositoryMatch?.[1]
    const repositoryRoute = repositoryMatch?.[2] ?? ''
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === ''
    ) {
      return json(repository(repositoryName))
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'branches'
    ) {
      return json(
        (repositoryName === 'fixture'
          ? [
              'alpha',
              'beta',
              'delta',
              'gamma',
              'main',
              'preview',
              'release',
              'unconfigured',
            ]
          : ['main']
        ).map((name) => ({ name })),
      )
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute.startsWith('branches/')
    ) {
      const name = decodeURIComponent(repositoryRoute.slice('branches/'.length))
      return (repositoryName === 'fixture'
        ? [
            'alpha',
            'beta',
            'delta',
            'gamma',
            'main',
            'preview',
            'release',
            'unconfigured',
          ]
        : ['main']
      ).includes(name)
        ? json({ name })
        : json({ message: 'Not found' }, 404)
    }
    if (url.pathname === '/graphql' && method === 'POST') {
      const payload = JSON.parse(String(init?.body)) as {
        variables: { expression?: string }
      }
      const expression = payload.variables.expression ?? ''
      const separator = expression.indexOf(':')
      const path = separator === -1 ? '' : expression.slice(separator + 1)
      return json({
        data: {
          repository: { object: { entries: directEntries(path) } },
        },
      })
    }

    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute.startsWith('contents/')
    ) {
      const path = url.pathname
        .slice(`/repos/pagescms/${repositoryName}/contents/`.length)
        .split('/')
        .map(decodeURIComponent)
        .join('/')
      if (method === 'GET') {
        if (
          path === '.pages.yml' &&
          url.searchParams.get('ref') === 'unconfigured'
        ) {
          return json({ message: 'Not found' }, 404)
        }
        const file = files.get(path)
        if (file) {
          if (
            new Headers(init?.headers).get('accept') ===
            'application/vnd.github.raw'
          ) {
            const etag = `"${file.sha}"`
            return new Response(
              new Headers(init?.headers).get('if-none-match') === etag
                ? null
                : file.content,
              {
                status:
                  new Headers(init?.headers).get('if-none-match') === etag
                    ? 304
                    : 200,
                headers: { etag },
              },
            )
          }
          return json({
            type: 'file',
            sha: file.sha,
            content: encoded(file.content),
          })
        }
        const entries = restEntries(path, repositoryName)
        return entries.length
          ? json(entries)
          : json({ message: 'Not found' }, 404)
      }
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as { content: string }
        const content = new TextDecoder().decode(
          Uint8Array.from(atob(body.content), (item) => item.charCodeAt(0)),
        )
        const sha = `entry-sha-${Date.now()}`
        files.set(path, { content, sha })
        return json({
          content: { path, sha },
          commit: { sha: `commit-${Date.now()}` },
        })
      }
      if (method === 'DELETE') {
        if (!files.delete(path)) return json({ message: 'Not found' }, 404)
        return json({ commit: { sha: `commit-${Date.now()}` } })
      }
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'git/ref/heads/main' &&
      method === 'GET'
    ) {
      return json({ object: { sha: 'fixture-head-sha' } })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute.startsWith('git/trees/') &&
      method === 'GET'
    ) {
      return json({
        sha: 'fixture-tree-sha',
        tree: [...files.entries()].map(([path, file]) => ({
          path,
          mode: '100644',
          type: 'blob',
          sha: file.sha,
        })),
      })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'git/trees' &&
      method === 'POST'
    ) {
      const body = JSON.parse(String(init?.body)) as {
        tree: Array<{ path: string; sha: string | null }>
      }
      const removed = body.tree.find((entry) => entry.sha === null)
      const added = body.tree.find((entry) => entry.sha !== null)
      const source = added
        ? [...files.values()].find((file) => file.sha === added.sha)
        : undefined
      if (!removed || !added || !source) {
        return json({ message: 'Invalid tree update' }, 422)
      }
      files.delete(removed.path)
      files.set(added.path, source)
      return json({ sha: `tree-${Date.now()}` })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'git/commits' &&
      method === 'POST'
    ) {
      return json({ sha: `commit-${Date.now()}` })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'git/refs/heads/main' &&
      method === 'PATCH'
    ) {
      return json({ object: { sha: `commit-${Date.now()}` } })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'commits' &&
      method === 'GET'
    ) {
      return json([])
    }

    return json(
      { message: `Unhandled fixture request: ${method} ${url.pathname}` },
      500,
    )
  }
}
