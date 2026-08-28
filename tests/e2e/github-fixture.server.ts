import { appendFileSync } from 'node:fs'

const configuration = `
media: public/images
content:
  - name: posts
    label: Posts
    type: collection
    path: content/posts
    filename: '{primary}.md'
    fields:
      - name: title
        label: Title
        type: string
      - name: body
        label: Body
        type: rich-text
`

const files = new Map([
  ['.pages.yml', { content: configuration, sha: 'config-sha' }],
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
])

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fixtureRepositories = ['fixture', 'private-fixture'] as const

function isFixtureRepository(value: string) {
  return fixtureRepositories.includes(
    value as (typeof fixtureRepositories)[number],
  )
}

function repository(name = 'fixture') {
  return {
    id: name === 'private-fixture' ? 2 : 1,
    name,
    private: name === 'private-fixture',
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

function directEntries(path: string) {
  const prefix = path ? `${path}/` : ''
  return [...files.entries()]
    .filter(([name]) => name.startsWith(prefix))
    .flatMap(([name, file]) => {
      const remainder = name.slice(prefix.length)
      if (!remainder || remainder.includes('/')) return []
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
  return [...files.entries()]
    .filter(([name]) => name.startsWith(prefix))
    .flatMap(([name, file]) => {
      const remainder = name.slice(prefix.length)
      if (!remainder || remainder.includes('/')) return []
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
}

function recordRequest(method: string, url: URL) {
  if (
    !/^\/repos\/pagescms\/(?:fixture|private-fixture)\/contents\/public\/images(?:\/|$)/.test(
      url.pathname,
    )
  )
    return
  const metricsPath = process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH
  if (!metricsPath) return
  appendFileSync(
    metricsPath,
    `${JSON.stringify({ method, path: url.pathname, search: url.search })}\n`,
  )
}

export const githubFixtureFetch: typeof fetch = async (input, init) => {
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
    return json([{ name: 'main' }])
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
      const file = files.get(path)
      if (file) {
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
