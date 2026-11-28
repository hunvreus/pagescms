import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import {
  cp,
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createProject } from '../packages/create-pagescms/create.mjs'

const core = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'pagescms-package-test-'))
const workspace = process.env.PAGESCMS_TEST_WORKSPACE === '1'
const root = workspace ? join(temporary, 'apps/cms') : temporary
if (workspace) {
  await mkdir(root, { recursive: true })
  await writeFile(
    join(temporary, 'package.json'),
    JSON.stringify({ private: true }),
  )
  await writeFile(
    join(temporary, 'pnpm-workspace.yaml'),
    "packages:\n  - 'apps/*'\n",
  )
}
await createProject(root, 'vercel')
await mkdir(join(root, 'logs'))
console.log(`Independent package consumer: ${root}`)
let sequence = 0
function run(args, cwd = root, environment = {}) {
  const result = spawnSync('pnpm', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    maxBuffer: 30 * 1024 * 1024,
    timeout: 180000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const log = join(root, 'logs', `${++sequence}.log`)
  // Keep the complete compiler output available without drowning test results.
  void writeFile(log, output)
  if (result.status !== 0)
    throw new Error(`${args.join(' ')} failed; ${log}\n${output.slice(-6000)}`)
  return output
}
async function verifyPluginTranslations(page) {
  await page
    .locator('[data-package-translation]')
    .filter({ hasText: 'Package greeting' })
    .waitFor()
  const editor = await page
    .locator('[contenteditable=true]')
    .first()
    .elementHandle()
  await page
    .getByRole('combobox', { name: 'Interface language', exact: true })
    .click()
  await page.getByRole('option', { name: 'Français', exact: true }).click()
  await page
    .locator('[data-package-translation]')
    .filter({ hasText: 'Bonjour du plugin' })
    .waitFor()
  await page
    .getByRole('heading', { name: 'Traductions du plugin', exact: true })
    .waitFor()
  await page
    .getByRole('link', { name: 'Traductions du plugin', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Plugin count: 1' }).waitFor()
  assert.equal(await editor.evaluate((node) => node.isConnected), true)
  assert.equal(
    await page.locator('[contenteditable=true]').first().textContent(),
    'Edited in package',
  )
  const response = await page.request.get(page.url())
  assert.equal(response.status(), 200)
  const html = await response.text()
  assert.ok(html.includes('<div id="root"></div>'))
  const standalone = await page.request.get(
    new URL('/proof/translation', page.url()).href,
  )
  assert.equal(standalone.status(), 200)
  assert.ok((await standalone.text()).includes('<div id="root"></div>'))

  await page
    .getByRole('combobox', { name: 'Langue de l’interface', exact: true })
    .click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await page
    .locator('[data-package-translation]')
    .filter({ hasText: 'Package greeting' })
    .waitFor()
}

async function verifyApiBoundary(base) {
  const response = await fetch(new URL('/api/account/preferences', base), {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'cross-site',
    },
    body: '{}',
  })
  assert.equal(response.status, 403)
}

run(['pack', '--pack-destination', root], core)
run(
  ['pack', '--pack-destination', root],
  join(core, 'tests/fixtures/package-plugin'),
)
const corePackage = JSON.parse(
  await readFile(join(core, 'package.json'), 'utf8'),
)
const starter = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
await writeFile(
  join(root, 'package.json'),
  JSON.stringify(
    {
      ...starter,
      dependencies: {
        ...starter.dependencies,
        pagescms: `file:./pagescms-${corePackage.version}.tgz`,
        'pagescms-proof-plugin': 'file:./pagescms-proof-plugin-0.0.1.tgz',
        '@lingui/core': corePackage.dependencies['@lingui/core'],
        '@lingui/react': corePackage.dependencies['@lingui/react'],
      },
      devDependencies: {
        wrangler: corePackage.dependencies.wrangler,
        typescript: '6.0.3',
        '@types/node': '22.20.1',
        '@types/react': '19.2.18',
        '@types/react-dom': '19.2.4',
      },
    },
    null,
    2,
  ),
)
await cp(join(core, 'tests/package/app'), root, { recursive: true })
await cp(
  join(core, 'tests/package/consumer-runtime.mjs'),
  join(root, 'proof.mjs'),
)
run(['install', '--ignore-scripts'])
run(['exec', 'pagescms-setup-github-app', '--help'])
run([
  'exec',
  'pagescms-setup-github-app',
  '--base-url',
  'cms.example.com',
  '--dry-run',
  '--yes',
  '--no-open',
])
await writeFile(
  join(root, 'collaborators.csv'),
  'type,installationId,ownerId,repoId,owner,repo,branch,email,name,userId,invitedBy,invitedByEmail\nrepo,1,2,3,PagesCMS,Test,,person@example.com,Person,,,admin@example.com\n',
)
run([
  'exec',
  'pagescms-collaborators',
  'sql',
  '--input=collaborators.csv',
  '--output=collaborators.sql',
])
await access(join(root, 'collaborators.sql'))
run(['exec', 'tsc', '--noEmit'])
console.log('TypeScript config and local plugin declarations passed')
// Exercise the shipped rich-text editor too, without adding an internal widget
// to the supported public API. This path is inside the installed tarball only.
const accountFixture = join(root, 'plugins/account.mjs')
const accountSource = await readFile(accountFixture, 'utf8')
await writeFile(
  accountFixture,
  `import { lazy, Suspense } from 'react'\nimport { ContentIcon } from ${JSON.stringify(join(root, 'node_modules/pagescms/src/components/content-icon.tsx'))}\nconst loadConfiguredIcon = import.meta.env.SSR ? async () => undefined : () => import(${JSON.stringify(join(root, 'node_modules/pagescms/src/lib/content-icon-loader.ts'))}).then(module => module.loadContentIcon('News01Icon'))\nconst RichText = lazy(() => import(${JSON.stringify(join(root, 'node_modules/pagescms/src/components/rich-text-field.tsx'))}))\n` +
    accountSource
      .replace(
        'const [count, setCount]',
        "const [configuredIcon, setConfiguredIcon] = useState('pending')\n  const [editorOpen, setEditorOpen] = useState(false)\n  const [text, setText] = useState('Initial text')\n  const [count, setCount]",
      )
      .replace(
        "'Local plugin settings',",
        "'Local plugin settings',\n    createElement('span', { 'data-consumer-icon': true }, createElement(ContentIcon, { name: 'News01', fallback: [['path', { d: 'M0 0', key: 'fallback' }]] })),\n    createElement('button', { onClick: async () => { const icon = await loadConfiguredIcon(); setConfiguredIcon(Array.isArray(icon) && icon.length ? 'loaded' : 'missing') } }, 'Load configured icon'),\n    createElement('output', { 'data-configured-icon': true }, configuredIcon),\n    createElement('button', { onClick: () => setEditorOpen(true) }, 'Open rich-text editor'),\n    editorOpen && createElement(Suspense, { fallback: 'Loading editor' }, createElement(RichText, { id: 'package-rich-text', label: 'Package rich text', field: { name: 'body', type: 'rich-text' }, value: text, disabled: false, mode: 'editor', onChange: setText, onPendingUploadsChange: () => {} })),\n    createElement('output', { 'data-editor-value': true }, text),",
      ),
)
const environment = {
  DATABASE_URL: 'file:./proof.db',
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'package-proof-local-only-secret-123456789',
  PROOF_SECRET: 'RUNTIME_SECRET_SENTINEL',
  GITHUB_APP_WEBHOOK_SECRET: 'package-proof-webhook',
  SMTP_HOST: '127.0.0.1',
  SMTP_FROM: 'proof@example.test',
}
for (const key of ['DATABASE_URL', 'CACHE_DATABASE_URL']) {
  assert.throws(
    () =>
      run(['exec', 'pagescms', 'migrate', '--local'], root, {
        ...environment,
        [key]: 'libsql://remote.invalid',
      }),
    new RegExp(`Local setup requires a SQLite file for ${key}`),
  )
}
run(['exec', 'pagescms', 'migrate', '--local'], root, environment)
run(['exec', 'pagescms', 'migrate'], root, environment)
// Explicit mode must select the intended database rather than development.
await writeFile(
  join(root, '.env.production'),
  'DATABASE_URL=file:./production-mode.db\n',
)
await writeFile(
  join(root, '.env.development'),
  'DATABASE_URL=file:./development-mode.db\n',
)
run(['exec', 'pagescms', 'migrate', '--mode', 'production'])
await access(join(root, 'production-mode.db'))
await assert.rejects(access(join(root, 'development-mode.db')))
run(['run', 'build:function'])
assert.match(
  await readFile(join(root, 'dist/server/server.js'), 'utf8'),
  /pagescms\/libsql-web/,
)
const netlifyRoot = await createProject(join(root, '.netlify-proof'), 'netlify')
await symlink(join(root, 'dist'), join(netlifyRoot, 'dist'), 'junction')
run(
  [
    'exec',
    'node',
    '--input-type=module',
    '-e',
    `
    import { LibsqlError, LibsqlBatchError } from 'pagescms/libsql-web'
    if (!(LibsqlBatchError.prototype instanceof LibsqlError)) process.exit(1)
    import assert from 'node:assert/strict'
    import vercel from './api/index.mjs'
    import netlify from './.netlify-proof/netlify/functions/api.mjs'
    const request = new Request('http://localhost/api/plugins/proof/health?path=folder')
    for (const response of [await vercel.fetch(request), await netlify(request, { waitUntil() {} })]) {
      assert.equal(response.status, 200)
      assert.equal((await response.json()).configured, true)
    }
    const metadata = await netlify(new Request('http://localhost/.well-known/pagescms-proof'), { waitUntil() {} })
    assert.deepEqual(await metadata.json(), { ok: true })
  `,
  ],
  root,
  { ...environment, DATABASE_URL: 'http://127.0.0.1:1' },
)
console.log(
  'Serverless build includes registered plugin routes and remote libSQL',
)
run(['run', 'build'])
await checkServerIcons()
console.log('Node build, explicit migration mode and repeat migrations passed')
run(['exec', 'node', 'proof.mjs'], root, environment)
console.log('Node runtime and plugin UI passed')
async function checkNodeServer(command, port) {
  let output = ''
  const child = spawn(
    'pnpm',
    ['exec', 'pagescms', command, '--port', String(port)],
    {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  )
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  try {
    let ready = false
    for (let i = 0; i < 90; i++) {
      if (child.exitCode !== null) throw new Error(output)
      try {
        ready =
          (await fetch(`http://localhost:${port}/api/plugins/proof/health`))
            .status === 200
      } catch {}
      if (ready) break
      await new Promise((done) => setTimeout(done, 500))
    }
    assert.ok(ready, output)
    const body = '{}'
    const push = await fetch(`http://localhost:${port}/api/webhook/github`, {
      method: 'POST',
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256':
          'sha256=' +
          createHmac('sha256', environment.GITHUB_APP_WEBHOOK_SECRET)
            .update(body)
            .digest('hex'),
      },
      body,
    })
    assert.equal(push.status, 200)
    assert.deepEqual(await push.json(), { accepted: true })
    if (command === 'start') {
      await verifyApiBoundary(`http://localhost:${port}`)
      for (const path of ['/index.html', '/admin', '/oauth/consent']) {
        const response = await fetch(`http://localhost:${port}${path}`)
        assert.match(
          response.headers.get('content-security-policy') ?? '',
          /frame-ancestors 'none'/,
        )
        assert.equal(response.headers.get('x-frame-options'), 'DENY')
        assert.equal(response.headers.get('cache-control'), 'no-cache')
      }
      const response = await fetch(`http://localhost:${port}/index.html`)
      const script = (await response.text()).match(
        /src="(\/assets\/[^"]+\.js)"/,
      )?.[1]
      assert.ok(script)
      assert.match(
        (await fetch(`http://localhost:${port}${script}`)).headers.get(
          'cache-control',
        ) ?? '',
        /immutable/,
      )
    }
    assert.equal(
      (await fetch(`http://localhost:${port}/api/plugins/local-proof/typed`))
        .status,
      200,
    )
    const reference = await fetch(`http://localhost:${port}/reference.md`)
    assert.equal(reference.status, 200)
    assert.match(await reference.text(), /# Pages CMS configuration reference/)
    const referenceManifest = await fetch(
      `http://localhost:${port}/reference/manifest.json`,
    )
    assert.equal(referenceManifest.status, 200)
    assert.equal((await referenceManifest.json()).version, corePackage.version)
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') console.error(message.text())
      })
      page.on('requestfailed', (request) =>
        console.error(
          'Browser request failed:',
          request.url(),
          request.failure()?.errorText,
        ),
      )
      const signature = createHmac('sha256', environment.BETTER_AUTH_SECRET)
        .update('proof-token')
        .digest('base64')
      await page.context().addCookies([
        {
          name: 'better-auth.session_token',
          value: encodeURIComponent(`proof-token.${signature}`),
          domain: 'localhost',
          path: '/',
        },
      ])
      await page.goto(`http://localhost:${port}/settings`)
      await page.locator('[data-local-plugin][data-ready=true]').waitFor()
      await page
        .locator('[data-consumer-icon] path:not([d="M0 0"])')
        .first()
        .waitFor()
      await page.getByRole('button', { name: 'Load configured icon' }).click()
      await page
        .locator('[data-configured-icon]')
        .filter({ hasText: 'loaded' })
        .waitFor()
      await page.getByRole('button', { name: 'Plugin count: 0' }).click()
      await page.getByRole('button', { name: 'Plugin count: 1' }).waitFor()
      await page.getByRole('button', { name: 'Open rich-text editor' }).click()
      await page
        .locator('[contenteditable=true]')
        .first()
        .fill('Edited in package')
      await page
        .locator('[data-editor-value]')
        .filter({ hasText: 'Edited in package' })
        .waitFor()
      await verifyPluginTranslations(page)
      const styles = await page
        .locator('link[rel=stylesheet]')
        .evaluateAll(async (links) =>
          Promise.all(
            links.map(async (link) => (await fetch(link.href)).status),
          ),
        )
      if (command === 'dev') {
        assert.ok((await page.locator('style[data-vite-dev-id]').count()) > 0)
      } else {
        assert.ok(styles.length > 0)
      }
      assert.ok(
        styles.every((status) => status === 200),
        `Stylesheet responses: ${styles}`,
      )
      if (command === 'dev') {
        const path = join(root, 'plugins/account.mjs')
        const source = await readFile(path, 'utf8')
        try {
          await writeFile(
            path,
            source.replace('Plugin count:', 'Live plugin count:'),
          )
          await page
            .getByRole('button', { name: /Live plugin count:/ })
            .waitFor()
        } finally {
          await writeFile(path, source)
        }
      }
      assert.deepEqual(errors, [])
    } finally {
      await browser.close()
    }
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
    await writeFile(join(root, `logs/${command}.log`), output)
  }
}
await checkNodeServer('start', 43217)
await checkNodeServer('dev', 43218)
console.log('Node start, dev, browser rendering and local plugin HMR passed')
async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    result.push(...(entry.isDirectory() ? await files(path) : [path]))
  }
  return result
}
async function checkServerIcons() {
  const serverFiles = await files(join(root, 'dist/server'))
  assert.ok(
    !serverFiles.some((path) => /(?:^|\/)content-icon-loader-/.test(path)),
    'Configured icon catalogue must stay out of consumer server builds',
  )
}
async function checkBrowser() {
  let css = ''
  for (const path of await files(join(root, 'dist/client'))) {
    if (!/\.(js|css|html|json|map)$/.test(path)) continue
    const text = await readFile(path, 'utf8')
    assert.doesNotMatch(text, /PRIVATE_OPTION_SENTINEL|RUNTIME_SECRET_SENTINEL/)
    if (path.endsWith('.css')) css += text
  }
  assert.match(css, /letter-spacing:\s*\.123em/)
}
await checkBrowser()
const configPath = join(root, 'pagescms.config.ts')
const nodeConfig = await readFile(configPath, 'utf8')
await writeFile(
  configPath,
  nodeConfig
    .replace("target: 'node'", "target: 'cloudflare'")
    .replace('smtp(),', ''),
)
run(['exec', 'pagescms', 'migrate'])
run(['exec', 'pagescms', 'migrate'])
await writeFile(
  join(root, '.dev.vars'),
  Object.entries(environment)
    .filter(([key]) => key !== 'DATABASE_URL')
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'),
)
const now = Date.now()
await writeFile(
  join(root, 'seed.sql'),
  `INSERT INTO user (id,name,email,email_verified,created_at,updated_at,onboarding_completed_at) VALUES ('proof-user','Proof User','proof@example.test',1,${now},${now},${now});\nINSERT INTO session (id,token,user_id,expires_at,created_at,updated_at) VALUES ('proof-session','proof-token','proof-user',${now + 3600000},${now},${now});`,
)
run([
  'exec',
  'wrangler',
  'd1',
  'execute',
  'DATABASE',
  '--local',
  '--file',
  'seed.sql',
])
// Preview exercises built output; also exercise a cold Worker dependency optimizer.
await rm(join(root, 'node_modules/.vite'), { recursive: true, force: true })
const dev = spawn('pnpm', ['exec', 'pagescms', 'dev', '--port', '43220'], {
  cwd: root,
  env: { ...process.env, ...environment },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let devOutput = ''
for (const stream of [dev.stdout, dev.stderr])
  stream.on('data', (chunk) => {
    devOutput += chunk
  })
try {
  let ready = false
  for (let attempt = 0; attempt < 90; attempt++) {
    if (dev.exitCode !== null) throw new Error(devOutput)
    try {
      ready =
        (await fetch('http://localhost:43220/api/plugins/proof/health'))
          .status === 200
    } catch {}
    if (ready) break
    await new Promise((done) => setTimeout(done, 500))
  }
  assert.ok(ready, devOutput)
  assert.deepEqual(
    await (
      await fetch('http://localhost:43220/.well-known/pagescms-proof')
    ).json(),
    { ok: true },
  )
  assert.equal(
    (await fetch('http://localhost:43220/api/plugins/local-proof/typed'))
      .status,
    200,
  )
  assert.equal((await fetch('http://localhost:43220/sign-in')).status, 200)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(message.text())
    })
    page.on('requestfailed', (request) =>
      console.error(
        'Browser request failed:',
        request.url(),
        request.failure()?.errorText,
      ),
    )
    const signature = createHmac('sha256', environment.BETTER_AUTH_SECRET)
      .update('proof-token')
      .digest('base64')
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: encodeURIComponent(`proof-token.${signature}`),
        domain: 'localhost',
        path: '/',
      },
    ])
    await page.goto('http://localhost:43220/settings')
    await page.locator('[data-local-plugin][data-ready=true]').waitFor()
    await page
      .locator('[data-consumer-icon] path:not([d="M0 0"])')
      .first()
      .waitFor()
    // A production build must leave the live development module graph usable.
    run(['exec', 'pagescms', 'build'])
    await checkServerIcons()
    await page.reload()
    await page.locator('[data-local-plugin][data-ready=true]').waitFor()
    await page
      .locator('[data-consumer-icon] path:not([d="M0 0"])')
      .first()
      .waitFor()
    await page.getByRole('button', { name: 'Open rich-text editor' }).click()
    await page
      .locator('[contenteditable=true]')
      .first()
      .fill('Cold Worker editor')
    await page
      .locator('[data-editor-value]')
      .filter({ hasText: 'Cold Worker editor' })
      .waitFor()
    await page.waitForLoadState('networkidle')
    assert.deepEqual(errors, [])
    assert.doesNotMatch(
      devOutput,
      /Invalid hook call|Error in renderToReadableStream/,
    )
  } finally {
    await browser.close()
  }
} finally {
  try {
    process.kill(-dev.pid, 'SIGTERM')
  } catch {}
  await writeFile(join(root, 'logs/cloudflare-dev.log'), devOutput)
}
console.log(
  'Cloudflare dev, concurrent build and deferred rich-text editing passed',
)
await checkBrowser()
console.log('Cloudflare build, repeat migrations and browser isolation passed')
const previewVars = join(root, 'dist/worker/.dev.vars')
assert.equal((await stat(previewVars)).mode & 0o077, 0)
assert.match(await readFile(previewVars, 'utf8'), /BETTER_AUTH_SECRET=/)
const deployRedirect = JSON.parse(
  await readFile(join(root, '.wrangler/deploy/config.json'), 'utf8'),
)
assert.equal(
  resolve(root, '.wrangler/deploy', deployRedirect.configPath),
  join(root, 'dist/worker/wrangler.json'),
)
run(['exec', 'wrangler', 'deploy', '--dry-run'])
console.log('Renamed Cloudflare Worker deploy dry run passed')
// Preview reads the generated worker configuration and its local secret file.
await cp(join(root, '.dev.vars'), join(root, 'dist/worker/.dev.vars'))
const port = 43219
let previewOutput = ''
const preview = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '--config',
    'dist/worker/wrangler.json',
    '--port',
    String(port),
    '--inspector-port',
    '0',
    '--persist-to',
    join(root, '.wrangler/state'),
  ],
  {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  },
)
preview.stdout.on('data', (chunk) => {
  previewOutput += chunk
})
preview.stderr.on('data', (chunk) => {
  previewOutput += chunk
})
try {
  let ready = false
  for (let i = 0; i < 60; i++) {
    if (preview.exitCode !== null) throw new Error(previewOutput)
    try {
      ready =
        (await fetch(`http://localhost:${port}/api/plugins/proof/health`))
          .status === 200
    } catch {}
    if (ready) break
    await new Promise((done) => setTimeout(done, 500))
  }
  assert.ok(ready, previewOutput)
  await verifyApiBoundary(`http://localhost:${port}`)
  const base = `http://localhost:${port}`
  assert.deepEqual(
    await (await fetch(`${base}/.well-known/pagescms-proof`)).json(),
    { ok: true },
  )
  assert.deepEqual(
    await (
      await fetch(`${base}/mcp`, { headers: { 'Sec-Fetch-Mode': 'navigate' } })
    ).json(),
    { plugin: 'proof' },
  )
  const branchPage = await fetch(
    `${base}/github/example/project/feature%2Fnews`,
    {
      redirect: 'manual',
    },
  )
  assert.equal(branchPage.status, 200)
  assert.match(await branchPage.text(), /id="root"/)
  const reference = await fetch(`${base}/reference.md`)
  assert.equal(reference.status, 200)
  assert.match(await reference.text(), /# Pages CMS configuration reference/)
  const referenceManifest = await fetch(`${base}/reference/manifest.json`)
  assert.equal(referenceManifest.status, 200)
  assert.ok(
    (await referenceManifest.json()).files.some(
      (file) => file.path === 'docs/configuration/localization.md',
    ),
  )
  const health = await fetch(`${base}/api/plugins/proof/health`)
  assert.deepEqual(await health.json(), {
    ok: true,
    configured: true,
    secret: true,
    read: 'HELLO',
    write: 'hello',
    valid: true,
  })
  const storage = await fetch(`${base}/api/plugins/proof/storage`)
  assert.deepEqual(await storage.json(), {
    database: 'migration-ok',
    object: 'local-r2-value',
  })
  assert.equal((await fetch(`${base}/api/plugins/proof/private`)).status, 401)
  const signature = createHmac('sha256', environment.BETTER_AUTH_SECRET)
    .update('proof-token')
    .digest('base64')
  const headers = {
    cookie: `better-auth.session_token=${encodeURIComponent(`proof-token.${signature}`)}`,
  }
  assert.equal(
    (await fetch(`${base}/api/plugins/proof/private`, { headers })).status,
    200,
  )
  const settings = await fetch(`${base}/settings`, { headers })
  assert.equal(settings.status, 200)
  assert.match(await settings.text(), /<div id="root"><\/div>/)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(message.text())
    })
    page.on('requestfailed', (request) =>
      console.error(
        'Browser request failed:',
        request.url(),
        request.failure()?.errorText,
      ),
    )
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: encodeURIComponent(`proof-token.${signature}`),
        domain: 'localhost',
        path: '/',
      },
    ])
    await page.goto(`${base}/settings`)
    await page.locator('[data-local-plugin][data-ready=true]').waitFor()
    await page
      .locator('[data-consumer-icon] path:not([d="M0 0"])')
      .first()
      .waitFor()
    await page.getByRole('button', { name: 'Load configured icon' }).click()
    await page
      .locator('[data-configured-icon]')
      .filter({ hasText: 'loaded' })
      .waitFor()
    await page.getByRole('button', { name: 'Plugin count: 0' }).click()
    await page.getByRole('button', { name: 'Plugin count: 1' }).waitFor()
    await page.getByRole('button', { name: 'Open rich-text editor' }).click()
    await page
      .locator('[contenteditable=true]')
      .first()
      .fill('Edited in package')
    await page
      .locator('[data-editor-value]')
      .filter({ hasText: 'Edited in package' })
      .waitFor()
    await verifyPluginTranslations(page)
    const styles = await page
      .locator('link[rel=stylesheet]')
      .evaluateAll(async (links) =>
        Promise.all(links.map(async (link) => (await fetch(link.href)).status)),
      )
    assert.ok(styles.length > 0 && styles.every((status) => status === 200))
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
  console.log('Cloudflare runtime, D1, R2, session and plugin UI passed')
} finally {
  // Stop only this test's detached process group, never an existing dev server.
  try {
    process.kill(-preview.pid, 'SIGTERM')
  } catch {}
  await writeFile(join(root, 'logs/preview.log'), previewOutput)
}
const cloudflareConfig = await readFile(configPath, 'utf8')
await writeFile(
  configPath,
  `import { defineConfig } from 'pagescms'\nimport { smtp } from 'pagescms/plugins/smtp'\nexport default defineConfig({ target: 'cloudflare', plugins: [smtp()] })`,
)
let rejected = false
try {
  run(['exec', 'pagescms', 'build'])
} catch (error) {
  rejected = /does not support|not support|unsupported/i.test(error.message)
}
assert.ok(
  rejected,
  'Incompatible plugins must fail before importing runtime code',
)
await writeFile(configPath, cloudflareConfig)
const clientPath = join(root, 'plugins/local-ui.ts')
const clientSource = await readFile(clientPath, 'utf8')
await writeFile(
  join(root, 'plugins/unsafe.server.mjs'),
  `export const value = 'SERVER_IMPORT_MUST_BE_DENIED'`,
)
await writeFile(
  clientPath,
  `import { value } from './unsafe.server.mjs'\nconsole.log(value)\n${clientSource}`,
)
rejected = false
try {
  run(['exec', 'pagescms', 'build'])
} catch (error) {
  rejected = /Import denied in client environment/.test(error.message)
}
assert.ok(
  rejected,
  'Server-only code imported into browser contributions must fail the build',
)
await writeFile(clientPath, clientSource)
await writeFile(
  clientPath,
  `import server from ${JSON.stringify(join(root, 'node_modules/pagescms-proof-plugin/server.mjs'))}\nconsole.log(server)\n${clientSource}`,
)
rejected = false
try {
  run(['exec', 'pagescms', 'build'])
} catch (error) {
  rejected = /Import denied in client environment/.test(error.message)
}
assert.ok(
  rejected,
  'A declared npm server entry must be blocked even without a .server suffix',
)
await writeFile(clientPath, clientSource)
console.log('Runtime compatibility and server-import rejection passed')
console.log(`PASS: independent package proof. Artifacts retained in ${root}`)
