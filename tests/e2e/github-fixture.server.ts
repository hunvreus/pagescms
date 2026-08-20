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
      content: '---\ntitle: Hello world\nbody: Welcome to Pages CMS.\n---\n',
      sha: 'entry-sha-1',
    },
  ],
])

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function repository() {
  return {
    id: 1,
    name: 'fixture',
    private: false,
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

export const githubFixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  )
  const method = init?.method ?? 'GET'

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
    return json({ total_count: 1, repositories: [repository()] })
  }
  if (url.pathname === '/repos/pagescms/fixture') return json(repository())
  if (url.pathname === '/repos/pagescms/fixture/branches') {
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

  const contentPrefix = '/repos/pagescms/fixture/contents/'
  if (url.pathname.startsWith(contentPrefix)) {
    const path = url.pathname
      .slice(contentPrefix.length)
      .split('/')
      .map(decodeURIComponent)
      .join('/')
    if (method === 'GET') {
      const file = files.get(path)
      return file
        ? json({ type: 'file', sha: file.sha, content: encoded(file.content) })
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
  if (url.pathname === '/repos/pagescms/fixture/commits' && method === 'GET') {
    return json([])
  }

  return json(
    { message: `Unhandled fixture request: ${method} ${url.pathname}` },
    500,
  )
}
