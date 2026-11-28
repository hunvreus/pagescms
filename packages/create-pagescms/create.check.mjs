import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'
import { createProject, VERSION } from './create.mjs'

const root = await mkdtemp(join(tmpdir(), 'create-pagescms-'))
after(() => rm(root, { recursive: true, force: true }))

test('creator, core and generated dependency versions agree', async () => {
  const core = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  )
  const creator = JSON.parse(
    await readFile(new URL('./package.json', import.meta.url), 'utf8'),
  )
  assert.equal(VERSION, core.version)
  assert.equal(creator.version, core.version)
})

for (const target of ['node', 'cloudflare', 'netlify', 'vercel']) {
  test(`creates a ${target} project with the released core version`, async () => {
    const path = await createProject(join(root, target), target)
    const manifest = JSON.parse(
      await readFile(join(path, 'package.json'), 'utf8'),
    )
    assert.equal(manifest.dependencies.pagescms, VERSION)
    assert.deepEqual(manifest.overrides, {
      '@tiptap/extension-bubble-menu': '3.31.3',
      '@tiptap/extension-floating-menu': '3.31.3',
    })
    assert.deepEqual(manifest.pnpm.overrides, manifest.overrides)
    assert.match(
      await readFile(join(path, 'pagescms.config.ts'), 'utf8'),
      new RegExp(
        `target: '${target === 'cloudflare' ? 'cloudflare' : 'node'}'`,
      ),
    )
    assert.match(await readFile(join(path, '.gitignore'), 'utf8'), /\.env\*/)
    assert.equal(
      manifest.scripts['setup:github-app'],
      'pagescms-setup-github-app',
    )
    assert.equal(
      manifest.scripts['migrate:2x'],
      'pagescms-collaborators migrate-2x',
    )
    if (target === 'cloudflare') {
      const config = JSON.parse(
        await readFile(join(path, 'wrangler.jsonc'), 'utf8'),
      )
      assert.equal(
        config.d1_databases[0].migrations_dir,
        'node_modules/pagescms/drizzle',
      )
      assert.equal(
        config.d1_databases[0].migrations_table,
        '__pagescms_core_d1_migrations',
      )
      assert.equal(manifest.scripts.deploy, 'wrangler deploy')
      assert.equal(
        manifest.scripts['migrate:remote'],
        'pagescms migrate --remote',
      )
      assert.equal(
        manifest.scripts['deploy:dry-run'],
        'wrangler deploy --dry-run',
      )
    }
    if (target === 'netlify' || target === 'vercel') {
      assert.equal(manifest.scripts.build, 'pagescms build')
      assert.equal(
        manifest.scripts['build:function'],
        'pagescms build --remote-libsql',
      )
      const deployment = await readFile(
        join(path, target === 'netlify' ? 'netlify.toml' : 'vercel.json'),
        'utf8',
      )
      if (target === 'netlify')
        assert.match(deployment, /^\s*command = "npm run build:function"$/m)
      else {
        const { buildCommand, rewrites } = JSON.parse(deployment)
        assert.equal(buildCommand, 'npm run build:function')
        const destination = (path) =>
          rewrites.find(({ source }) => new RegExp(`^${source}$`).test(path))
            ?.destination
        assert.equal(destination('/api/auth/callback/github'), '/api')
        assert.equal(
          destination('/.well-known/oauth-protected-resource/mcp'),
          '/api',
        )
        assert.notEqual(
          destination('/.well-known/acme-challenge/token'),
          '/api',
        )
        assert.equal(destination('/settings'), '/index.html')
      }
      assert.equal(manifest.scripts.migrate, 'pagescms migrate')
      assert.match(
        await readFile(
          join(
            path,
            target === 'netlify'
              ? 'netlify/functions/api.mjs'
              : 'api/index.mjs',
          ),
          'utf8',
        ),
        /dist\/server\/server\.js/,
      )
    }
  })
}

test('generates a private unique secret without putting one in the example', async () => {
  const first = await createProject(join(root, 'secret-one'), 'node')
  const second = await createProject(join(root, 'secret-two'), 'node')
  const example = await readFile(join(first, '.env.example'), 'utf8')
  const local = await readFile(join(first, '.env.local'), 'utf8')
  const other = await readFile(join(second, '.env.local'), 'utf8')
  const secret = /^BETTER_AUTH_SECRET="([^"]+)"/m.exec(local)?.[1]
  const otherSecret = /^BETTER_AUTH_SECRET="([^"]+)"/m.exec(other)?.[1]
  assert.match(example, /^BETTER_AUTH_SECRET=""$/m)
  assert.ok(secret)
  assert.ok(otherSecret)
  assert.equal(Buffer.from(secret, 'base64').length, 32)
  assert.notEqual(secret, otherSecret)
  if (process.platform !== 'win32')
    assert.equal((await stat(join(first, '.env.local'))).mode & 0o777, 0o600)
})

test('does not overwrite an existing project', async () => {
  const path = join(root, 'node')
  await writeFile(join(path, 'keep.txt'), 'keep')
  await assert.rejects(createProject(path, 'node'), /not empty/)
  assert.equal(await readFile(join(path, 'keep.txt'), 'utf8'), 'keep')
})

test('rejects an unsupported target without creating a directory', async () => {
  await assert.rejects(
    createProject(join(root, 'invalid'), 'unsupported'),
    /Target must/,
  )
})

test('the packaged command creates the requested project without prompts', async () => {
  const destination = join(root, 'from-cli')
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./cli.mjs', import.meta.url)),
      destination,
      '--target',
      'cloudflare',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(
    await readFile(join(destination, 'pagescms.config.ts'), 'utf8'),
    /target: 'cloudflare'/,
  )
})

test('non-interactive creation defaults to Node and leaves installation to the user', async () => {
  const destination = join(root, 'default-cli')
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./cli.mjs', import.meta.url)), destination],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /npm install/)
  assert.match(
    await readFile(join(destination, 'pagescms.config.ts'), 'utf8'),
    /target: 'node'/,
  )
  await assert.rejects(stat(join(destination, 'node_modules')), {
    code: 'ENOENT',
  })
})
