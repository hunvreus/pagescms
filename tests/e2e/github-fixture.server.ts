import { appendFileSync } from 'node:fs'

export const configuration = `
i18n:
  default: en
  locales: [en, fr, ar]
settings:
  cache: true
  content:
    merge: true
actions:
  - name: deploy
    label: Deploy site
    workflow: deploy.yml
    ref: current
    scope: overview
    confirm:
      title: Deploy site?
      message: This will trigger the deployment workflow.
      button: Deploy
media: public/images
content:
  - name: groups
    icon: not-a-real-icon
    label: Groups
    type: file
    path: content/groups.json
    actions:
      - name: confirmed-test
        label: Confirm workflow
        workflow: deploy.yml
        confirm:
          title: Deploy site?
          message: This will trigger the deployment workflow.
          button: Deploy
      - name: input-test
        label: Test action inputs
        workflow: deploy.yml
        confirm:
          title: Run input test?
          message: Check the supplied inputs.
          button: Start test
        fields:
          - name: title
            label: Action title
            type: text
            required: true
          - name: notes
            label: Action notes
            type: textarea
            required: true
          - name: environment
            label: Environment
            type: select
            required: true
            default: staging
            options:
              - label: Staging
                value: staging
              - label: Production
                value: production
          - name: force
            label: Force
            type: checkbox
            default: true
          - name: count
            label: Count
            type: number
            default: 2
      - name: input-no-confirm
        label: Inputs without confirmation
        workflow: deploy.yml
        confirm: false
        fields:
          - name: message
            label: Message
            type: text
            default: Hello
      - name: immediate-test
        label: Run immediately
        workflow: deploy.yml
        confirm: false
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
              - name: heading
                label: Block heading
                type: string
              - name: body
                label: Body
                type: rich-text
  - name: posts
    icon: News01
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
        options:
          snippets:
            - label: Alert
              source: |
                <div class="alert"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg><h2>Heads up!</h2><section>You can add components and dependencies to your app.</section><footer><a href="/enable" class="btn" data-variant="outline">Enable</a></footer></div>
          html:
            keep: [figure, dl, div.callout, details, summary, span.badge, div.alert, div.alert section, div.alert footer]
            attributes: [data-variant]
            strip: [div.legacy]
            drop: [.discard]
  - name: html-editor
    label: HTML editor
    type: file
    path: content/html-editor.json
    fields:
      - name: body
        label: HTML body
        type: rich-text
        options:
          format: html
          snippets:
            - label: Alert
              source: |
                <div class="alert"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg><h2>Heads up!</h2><section>You can add components and dependencies to your app.</section><footer><a href="/enable" class="btn" data-variant="outline">Enable</a></footer></div>
          html:
            keep: [figure, dl, div.callout, details, summary, div.alert, div.alert section, div.alert footer]
            attributes: [data-variant]
            strip: [div.legacy]
            drop: [.discard]
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
  - name: selection-controls
    label: Selection controls
    type: file
    path: content/selection-controls.json
    fields:
      - name: status
        label: Selection status
        type: select
        required: true
        options:
          values: [Draft, Published]
      - name: topics
        label: Topics
        type: select
        options:
          multiple:
            min: 1
            max: 2
          values: [News, Guides, Reviews]
      - name: related
        label: Related post
        type: reference
        options:
          collection: posts
      - name: references
        label: Related posts
        type: reference
        options:
          collection: posts
          multiple: true
          max: 2
      - name: locked
        label: Locked topics
        type: select
        readonly: true
        options:
          multiple: true
          values: [News, Guides]
  - name: regression-controls
    label: Regression controls
    type: file
    path: content/regression-controls.json
    fields:
      - name: title
        label: Regression title
        type: string
      - name: numbers
        label: Numbers
        type: number
        list:
          min: 1
      - name: sections
        label: Sections
        type: object
        list:
          collapsible:
            collapsed: true
        fields:
          - name: title
            label: Section title
            type: string
            required: true
          - name: count
            label: Section count
            type: number
            required: true
      - name: summary
        label: Summary
        type: text
        options:
          minlength: 3
          maxlength: 30
      - name: brokenDate
        label: Broken date
        type: date
      - name: nestedTopics
        label: Nested topics
        type: select
        list: true
        options:
          multiple: true
          values: [News, Guides]
      - name: legacyReference
        label: Legacy reference
        type: reference
        options:
          collection: posts
          label: '{primary}'
      - name: files
        label: Repeated files
        type: file
        options:
          multiple: true
          unique: false
          rename: safe
  - name: merge-review
    label: Merge review
    type: file
    path: content/merge-review.json
    fields:
      - name: title
        label: Title
        type: string
      - name: published
        label: Published
        type: string
      - name: author
        label: Author
        type: object
        fields:
          - name: name
            label: Author name
            type: string
          - name: email
            label: Author email
            type: string
      - name: items
        label: Items
        type: object
        list: true
        fields:
          - name: title
            label: Item title
            type: string
  - name: translations
    label: Translations
    type: collection
    path: content/translations
    filename: '{primary}.json'
    fields:
      - {name: title, label: Title, type: string, localized: true, required: true}
      - {name: image, label: Image, type: image, localized: true}
      - {name: body, label: Body, type: rich-text, localized: true}
      - name: items
        type: object
        list: true
        fields:
          - {name: text, type: string, localized: true}
    i18n: {scheme: fields}
  - name: languages
    label: Language files
    type: collection
    path: content/languages
    filename: '{primary}.json'
    fields:
      - {name: title, label: Title, type: string, required: true}
      - {name: image, label: Image, type: image}
      - {name: body, label: Body, type: rich-text}
    i18n:
      scheme: files
      path: {type: filename, position: suffix, default: omit}
  - name: dictionary
    label: Translation dictionary
    type: file
    path: content/dictionary.json
    localized: true
    fields:
      - {name: title, label: Title, type: string}
      - {name: items, label: Items, type: string, list: true}
    i18n: {scheme: fields}
  - name: bundles
    type: collection
    path: hugo/pages
    filename: '{primary}/_index.md'
    view: {layout: tree, node: _index.md}
    i18n: {scheme: files, path: {type: filename, position: suffix}}
    fields: [{name: title, label: Title, type: string}]
  - name: dated-posts
    type: collection
    path: hugo/posts
    filename: '{year}/{month}/{primary}.md'
    i18n: {scheme: files, path: {type: filename, position: suffix}}
    fields: [{name: title, label: Title, type: string}]
  - name: generic-pages
    type: collection
    path: content/generic
    filename: '{primary}.md'
    subfolders: false
    fields:
      - {name: title, type: string}
    i18n:
      scheme: files
      default: de
      locales: [de, en]
      path: {type: folder, position: parent}
  - name: folder-languages
    extension: json
    label: Folder languages
    type: collection
    path: content/folder-languages
    fields:
      - {name: title, label: Title, type: string}
    i18n:
      scheme: files
      path: {type: folder, position: custom, after: content, default: omit}

`

const initialFiles = new Map([
  ['hugo/posts/news/.gitkeep', { sha: 'empty-news', content: '' }],
  [
    'content/translations/hello.json',
    {
      sha: 'translation-sha',
      content: JSON.stringify({
        title: { en: 'Hello', fr: 'Bonjour', ar: 'مرحبا' },
        image: { en: '/public/images/hero.svg' },
        body: {
          en: '![Example](/public/images/hero.svg)',
          fr: 'Bonjour **tout le monde**',
        },
        items: [
          { text: { en: 'One', fr: 'Un' } },
          { text: { en: 'Two', fr: 'Deux' } },
        ],
        unknown: { keep: true },
      }),
    },
  ],
  [
    'content/languages/hello.json',
    {
      sha: 'language-en-sha',
      content: JSON.stringify({
        title: 'Hello',
        image: '/public/images/hero.svg',
        body: '![Example](/public/images/hero.svg)',
      }),
    },
  ],
  [
    'content/languages/hello.fr.json',
    {
      sha: 'language-fr-sha',
      content: JSON.stringify({
        title: 'Bonjour',
        image: '/public/images/hero.svg',
        body: 'Bonjour',
      }),
    },
  ],
  [
    'content/dictionary.json',
    {
      sha: 'dictionary-sha',
      content: JSON.stringify({
        en: { title: 'Hello', items: ['One', 'Two'] },
        fr: { title: 'Bonjour', items: ['Un'] },
        unknown: { keep: true },
      }),
    },
  ],
  [
    'content/generic/de/about.md',
    { sha: 'about-de', content: '---\ntitle: Über uns\n---\n' },
  ],
  [
    'content/generic/en/about.md',
    { sha: 'about-en', content: '---\ntitle: About us\n---\n' },
  ],
  [
    'content/folder-languages/guides/about.json',
    { sha: 'folder-en-sha', content: JSON.stringify({ title: 'About' }) },
  ],
  [
    'content/fr/folder-languages/guides/about.json',
    { sha: 'folder-fr-sha', content: JSON.stringify({ title: 'À propos' }) },
  ],
  [
    'content/merge-review.json',
    {
      content: JSON.stringify({
        title: 'Original title',
        published: 'Original date',
        author: { name: 'Original author', email: 'original@example.com' },
        items: [{ title: 'First item' }, { title: 'Second item' }],
      }),
      sha: 'merge-review-sha-1',
    },
  ],
  [
    'content/html-editor.json',
    {
      content: JSON.stringify({
        body: '<div class="callout"><h2>HTML title</h2><p>Description</p></div>',
      }),
      sha: 'html-editor-sha-1',
    },
  ],
  [
    'content/groups.json',
    {
      content: JSON.stringify({
        authors: [{ name: 'Ronan' }],
        layout: [{ _block: 'widget', heading: 'First block', body: 'Hello' }],
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
  [
    'content/regression-controls.json',
    {
      content: JSON.stringify({
        title: 'Regressions',
        numbers: [1, 2],
        sections: [{ title: '', count: null }],
        summary: 'Valid summary',
        brokenDate: 'invalid date',
        nestedTopics: [['News']],
        legacyReference: {
          value: 'content/posts/hello.md',
          label: 'Saved label',
        },
        files: ['public/images/parity-a.txt', 'public/images/parity-a.txt'],
      }),
      sha: 'regression-controls-sha',
    },
  ],
  ['public/images/parity-a.txt', { content: 'A', sha: 'parity-media-a' }],
  [
    'content/selection-controls.json',
    {
      content: JSON.stringify({
        status: 'Draft',
        topics: ['News'],
        related: 'content/posts/hello.md',
        references: ['content/posts/hello.md'],
        locked: ['Guides'],
      }),
      sha: 'selection-controls-sha',
    },
  ],
  ['public/images/parity-b.txt', { content: 'B', sha: 'parity-media-b' }],
  [
    'content/raw.ts',
    { content: 'const original: number = 42', sha: 'raw-code-sha-1' },
  ],
  ['.pages.yml', { content: configuration, sha: 'config-sha' }],
  [
    'content/posts/unchanged.md',
    {
      content:
        '---\ntitle: Unchanged rich text\n---\n![Hero](<public/images/hero.svg>)\n',
      sha: 'unchanged-sha-1',
    },
  ],
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
    node_id: `fixture-node-${id + 1}`,
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
  const pendingTrees = new Map<
    string,
    Map<string, { content: string; sha: string }>
  >()
  const pendingCommits = new Map<
    string,
    Map<string, { content: string; sha: string }>
  >()
  const createdBranches = new Set<string>()
  const branches = (repositoryName: string) =>
    repositoryName === 'fixture'
      ? [
          'alpha',
          'beta',
          'delta',
          'gamma',
          'main',
          'preview',
          'release',
          'unconfigured',
          'malformed-config',
          ...createdBranches,
        ]
      : ['main']
  const configuredBranches = new Set<string>()
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
    if (path === 'public/images/pagination-test') {
      return Array.from({ length: 205 }, (_, index) => ({
        name: `image-${String(index + 1).padStart(3, '0')}.svg`,
        path: `${path}/image-${String(index + 1).padStart(3, '0')}.svg`,
        type: 'file',
        sha: `pagination-sha-${index}`,
        size: 128,
        download_url: `http://127.0.0.1:3100/favicon.svg?asset=${index}`,
      }))
    }
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
      url.pathname !== '/graphql' &&
      !/^\/repositories\/[1-4]\/contents\/public\/images(?:\/|$)/.test(
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
    const bound = url.pathname.match(/^\/repositories\/(\d+)(\/.*)?$/)
    if (bound) {
      const index = Number(bound[1]) - 1
      const name = index >= 0 ? fixtureRepositories.at(index) : undefined
      if (!name) return json({ message: 'Not found' }, 404)
      url.pathname = `/repos/pagescms/${name}${bound.at(2) ?? ''}`
    }

    if (url.pathname === '/repos/pagescms/access-denied-fixture')
      return json({ message: 'Not Found' }, 404)

    if (url.pathname === '/repos/previous-owner/previous-fixture')
      return json(repository('fixture'))

    const authorization = new Headers(init?.headers).get('authorization') ?? ''
    if (
      url.pathname === '/user/installations' &&
      authorization.includes('empty-accounts-token')
    )
      return json({ total_count: 0, installations: [] })
    if (
      url.pathname === '/user/installations/1/repositories' &&
      authorization.includes('empty-repositories-token')
    )
      return json({ total_count: 0, repositories: [] })

    if (url.pathname === '/user/installations') {
      if (authorization.includes('slow-installations-token'))
        await new Promise((resolve) => setTimeout(resolve, 3000))
      if (authorization.includes('multi-account-projects-token'))
        return json({
          total_count: 2,
          installations: [
            {
              id: 1,
              repository_selection: 'all',
              account: { login: 'pagescms', type: 'Organization' },
            },
            {
              id: 2,
              repository_selection: 'selected',
              account: { login: 'studio', type: 'Organization' },
            },
          ],
        })
      return json({
        total_count: 1,
        installations: [
          {
            id: 1,
            repository_selection: authorization.includes(
              'searchable-repositories-token',
            )
              ? 'all'
              : 'selected',
            account: { login: 'pagescms', type: 'Organization' },
          },
        ],
      })
    }
    if (url.pathname === '/user/installations/1/repositories') {
      const repositories = fixtureRepositories.map((name) => repository(name))
      return json({
        total_count: repositories.length,
        repositories,
      })
    }
    if (
      url.pathname === '/user/installations/2/repositories' &&
      authorization.includes('multi-account-projects-token')
    )
      return json({
        total_count: 1,
        repositories: [
          {
            ...repository(),
            id: 101,
            name: 'studio-project',
            owner: { id: 2, login: 'studio' },
          },
        ],
      })
    if (url.pathname === '/search/repositories') {
      const keyword = (url.searchParams.get('q') ?? '')
        .split(' in:name')[0]
        .trim()
        .toLowerCase()
      const repositories = fixtureRepositories.map((name) => repository(name))
      if (authorization.includes('searchable-repositories-token'))
        repositories.push(
          { ...repository(), id: 105, name: 'recent-project' },
          { ...repository(), id: 106, name: 'remote-project' },
        )
      const matches = repositories.filter((item) =>
        item.name.toLowerCase().includes(keyword),
      )
      return json({
        total_count: matches.length,
        items: matches.slice(
          0,
          Number(url.searchParams.get('per_page') ?? '5'),
        ),
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
      return json(branches(repositoryName).map((name) => ({ name })))
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute.startsWith('branches/')
    ) {
      const name = decodeURIComponent(repositoryRoute.slice('branches/'.length))
      return branches(repositoryName).includes(name)
        ? json({ name })
        : json({ message: 'Not found' }, 404)
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'git/refs' &&
      method === 'POST'
    ) {
      const { ref, sha } = JSON.parse(String(init?.body)) as {
        ref: string
        sha: string
      }
      createdBranches.add(ref.replace('refs/heads/', ''))
      return json({ ref, object: { sha } }, 201)
    }
    if (url.pathname === '/graphql' && method === 'POST') {
      const payload = JSON.parse(String(init?.body)) as {
        variables: { expression?: string; [key: string]: unknown }
      }
      const expressions = Object.entries(payload.variables).filter(([name]) =>
        /^exp\d+$/.test(name),
      )
      if (expressions.length)
        return json({
          data: {
            repository: Object.fromEntries(
              expressions.map(([name, value]) => {
                const expression = String(value)
                const path = expression.slice(expression.indexOf(':') + 1)
                const file = files.get(path)
                return [
                  name.replace('exp', 'file'),
                  file
                    ? {
                        oid: file.sha,
                        byteSize: new TextEncoder().encode(file.content).length,
                        text: file.content,
                        isTruncated: false,
                      }
                    : null,
                ]
              }),
            ),
          },
        })
      const expression = payload.variables.expression ?? ''
      if (expression.startsWith('refs/heads/')) {
        const path = String(payload.variables.path ?? '')
        const tree = { entries: directEntries(path) }
        return json({
          data: {
            repository: {
              object: {
                oid: '1111111111111111111111111111111111111111',
                ...(path ? { file: { object: tree } } : { tree }),
              },
            },
          },
        })
      }
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
        const ref = url.searchParams.get('ref')
        const availableBranches = branches(repositoryName)
        if (
          ref &&
          !availableBranches.includes(ref) &&
          ref !== '1111111111111111111111111111111111111111'
        )
          return json({ message: `No commit found for the ref ${ref}` }, 404)
        if (
          path === '.pages.yml' &&
          url.searchParams.get('ref') === 'unconfigured' &&
          !configuredBranches.has('unconfigured')
        ) {
          return json({ message: 'Not found' }, 404)
        }
        if (
          path === '.pages.yml' &&
          ref === 'malformed-config' &&
          !configuredBranches.has('malformed-config')
        )
          return json({
            type: 'file',
            sha: 'config-sha',
            content: encoded('content: ['),
          })
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
        const body = JSON.parse(String(init?.body)) as {
          content: string
          branch?: string
          sha?: string
        }
        const existing =
          path === '.pages.yml' &&
          body.branch === 'unconfigured' &&
          !configuredBranches.has('unconfigured')
            ? undefined
            : files.get(path)
        if (
          (existing && body.sha === undefined) ||
          (body.sha !== undefined && body.sha !== existing?.sha)
        )
          return json(
            { message: 'File changed since this edit was opened' },
            409,
          )
        const content = new TextDecoder().decode(
          Uint8Array.from(atob(body.content), (item) => item.charCodeAt(0)),
        )
        const sha = `entry-sha-${Date.now()}`
        if (path === '.pages.yml') configuredBranches.add(body.branch ?? 'main')
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
      repositoryRoute.startsWith('git/ref/heads/') &&
      method === 'GET'
    ) {
      const branch = decodeURIComponent(
        repositoryRoute.slice('git/ref/heads/'.length),
      )
      if (!branches(repositoryName).includes(branch))
        return json({ message: 'Not found' }, 404)
      return json({
        object: { sha: '1111111111111111111111111111111111111111' },
      })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute.startsWith('git/trees/') &&
      method === 'GET'
    ) {
      const treeId = decodeURIComponent(
        repositoryRoute.slice('git/trees/'.length),
      )
      const prefix = treeId.startsWith('fixture-directory:')
        ? treeId.slice('fixture-directory:'.length)
        : ''
      const entries = new Map<
        string,
        { path: string; mode: string; type: string; sha: string }
      >()
      for (const [path, file] of files) {
        if (prefix && !path.startsWith(`${prefix}/`)) continue
        const relative = prefix ? path.slice(prefix.length + 1) : path
        const [name, ...rest] = relative.split('/')
        const directory = prefix ? `${prefix}/${name}` : name
        entries.set(
          name,
          rest.length
            ? {
                path: name,
                mode: '040000',
                type: 'tree',
                sha: `fixture-directory:${directory}`,
              }
            : { path: name, mode: '100644', type: 'blob', sha: file.sha },
        )
      }
      return json({
        sha: prefix ? treeId : 'fixture-tree-sha',
        truncated: false,
        tree: [...entries.values()],
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
      const next = new Map(files)
      for (const entry of body.tree) {
        if (entry.sha === null) next.delete(entry.path)
        else {
          const source = [...files.values()].find(
            (file) => file.sha === entry.sha,
          )
          if (!source) return json({ message: 'Invalid tree update' }, 422)
          next.set(entry.path, { ...source })
        }
      }
      const sha = `tree-${Date.now()}`
      pendingTrees.set(sha, next)
      return json({ sha })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'git/commits' &&
      method === 'POST'
    ) {
      const body = JSON.parse(String(init?.body)) as { tree: string }
      const tree = pendingTrees.get(body.tree)
      if (!tree) return json({ message: 'Unknown tree' }, 422)
      const sha = `commit-${Date.now()}`
      pendingCommits.set(sha, tree)
      return json({ sha })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'git/refs/heads/main' &&
      method === 'PATCH'
    ) {
      const body = JSON.parse(String(init?.body)) as { sha: string }
      const snapshot = pendingCommits.get(body.sha)
      if (!snapshot) return json({ message: 'Unknown commit' }, 422)
      files.clear()
      for (const [path, file] of snapshot) files.set(path, file)
      return json({ object: { sha: body.sha } })
    }
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'commits' &&
      method === 'GET'
    ) {
      const path = url.searchParams.get('path')
      const count =
        path === 'content/groups.json'
          ? 23
          : path === 'content/raw.ts'
            ? 20
            : path === '.pages.yml' && url.searchParams.get('sha') === 'preview'
              ? 13
              : 0
      const page = Number(url.searchParams.get('page') ?? '1')
      const limit = Number(url.searchParams.get('per_page') ?? '30')
      return json(
        Array.from({ length: count }, (_, index) => ({
          sha: `history-${index + 1}`,
          html_url: `https://github.com/pagescms/fixture/commit/history-${index + 1}`,
          commit: {
            message: `Update ${index + 1}`,
            author: {
              name: `History author ${index + 1}`,
              date: '2026-10-12T00:00:00Z',
            },
          },
          author: null,
        })).slice((page - 1) * limit, page * limit),
      )
    }

    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'actions/workflows/deploy.yml/dispatches' &&
      method === 'POST'
    )
      return new Response(null, { status: 204 })
    if (
      repositoryName &&
      isFixtureRepository(repositoryName) &&
      repositoryRoute === 'actions/workflows/deploy.yml/runs' &&
      method === 'GET'
    )
      return json({ workflow_runs: [] })

    return json(
      { message: `Unhandled fixture request: ${method} ${url.pathname}` },
      500,
    )
  }
}
