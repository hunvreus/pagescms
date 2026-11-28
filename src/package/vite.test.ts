import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveConfig } from 'vite'
import { definePlugin } from './config'
import { generatePackageEntries } from './generate'
import {
  allowedDirectories,
  createServerOnlyMatcher,
  pagescms,
  toVitePath,
} from './vite'
import type { PluginDescriptor } from './config'

const directory = mkdtempSync(join(tmpdir(), 'pagescms-vite-'))

afterAll(() => rmSync(directory, { recursive: true, force: true }))

// definePlugin rejects drive paths on POSIX hosts, so build Windows descriptors directly.
function windowsPlugin(modules: Partial<PluginDescriptor>): PluginDescriptor {
  return {
    id: 'windows',
    targets: ['node'],
    options: {},
    publicOptions: {},
    ...modules,
  }
}

describe('toVitePath', () => {
  it('matches Vite IDs for Windows paths', () => {
    expect(toVitePath('C:\\Users\\app\\node_modules\\pagescms\\src')).toBe(
      'C:/Users/app/node_modules/pagescms/src',
    )
    expect(toVitePath('C:\\app\\src\\..\\src\\router.tsx')).toBe(
      'C:/app/src/router.tsx',
    )
  })

  it('keeps POSIX paths unchanged', () => {
    expect(toVitePath('/app/node_modules/pagescms/src')).toBe(
      '/app/node_modules/pagescms/src',
    )
  })

  it('gives the generator a core prefix without backslashes', () => {
    const windowsSource = 'C:\\app\\node_modules\\pagescms\\src'
    const config = { target: 'node', plugins: [] } as const
    expect(() =>
      generatePackageEntries(config, { coreImportPrefix: `${windowsSource}/` }),
    ).toThrow('Invalid core import prefix')
    const { server, client } = generatePackageEntries(config, {
      coreImportPrefix: `${toVitePath(windowsSource)}/`,
    })
    expect(server).toContain(
      '"C:/app/node_modules/pagescms/src/package/runtime.server"',
    )
    expect(client).toContain(
      '"C:/app/node_modules/pagescms/src/package/runtime"',
    )
  })
})

describe('createServerOnlyMatcher', () => {
  it('protects resolved symlink entries as well as their configured paths', () => {
    const actual = join(directory, 'private-entry.ts')
    const linked = join(directory, 'linked-entry.ts')
    writeFileSync(actual, 'export default {}')
    symlinkSync(actual, linked)
    const matches = createServerOnlyMatcher([
      definePlugin({ id: 'linked', server: linked }),
    ])
    expect(matches(actual)).toBe(true)
    expect(matches(`${linked}?import`)).toBe(true)
  })

  it('matches Windows server plugin modules against Vite IDs', () => {
    const serverOnly = createServerOnlyMatcher([
      windowsPlugin({
        server: 'C:\\plugins\\audit\\server.ts',
        client: 'C:\\plugins\\audit\\client.tsx',
      }),
    ])
    expect(serverOnly('C:/plugins/audit/server.ts')).toBe(true)
    expect(serverOnly('C:/plugins/audit/server.ts?import')).toBe(true)
    expect(serverOnly('C:\\plugins\\audit\\server.ts')).toBe(true)
    expect(serverOnly('C:/plugins/audit/client.tsx')).toBe(false)
    expect(serverOnly('C:/app/src/lib/db.server.ts?v=1')).toBe(true)
    expect(serverOnly('C:/app/src/server/auth/session.ts?v=1')).toBe(true)
  })

  it('matches POSIX server plugin modules', () => {
    const serverOnly = createServerOnlyMatcher([
      definePlugin({ id: 'audit', server: '/plugins/audit/index.ts' }),
    ])
    expect(serverOnly('/plugins/audit/index.ts?import')).toBe(true)
    expect(serverOnly('/plugins/audit/client.ts')).toBe(false)
    expect(serverOnly('')).toBe(false)
  })
})

describe('allowedDirectories', () => {
  it('keeps the workspace root and adds plugin browser module directories', () => {
    const workspace = join(directory, 'workspace')
    const root = join(workspace, 'apps', 'site')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(workspace, 'pnpm-workspace.yaml'), 'packages: []\n')
    writeFileSync(join(root, 'package.json'), '{}')
    const linked = join(directory, 'linked-plugin')
    const generated = join(root, '.pagescms')

    const allowed = allowedDirectories(root, generated, [
      definePlugin({
        id: 'linked',
        server: join(linked, 'server', 'index.ts'),
        shared: join(linked, 'shared', 'index.ts'),
        client: join(linked, 'client', 'index.tsx'),
      }),
    ])

    expect(allowed).toContain(toVitePath(workspace))
    expect(allowed).toContain(toVitePath(generated))
    expect(allowed).toContain(toVitePath(join(linked, 'shared')))
    expect(allowed).toContain(toVitePath(join(linked, 'client')))
    expect(allowed).not.toContain(toVitePath(join(linked, 'server')))
    expect(allowed.every((path) => !path.includes('\\'))).toBe(true)
    expect(new Set(allowed).size).toBe(allowed.length)
  })
})

it('isolates dependency caches across runtimes, build commands and modes', async () => {
  const root = join(directory, 'cache-consumer')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  const cachePaths = []
  for (const target of ['node', 'cloudflare']) {
    writeFileSync(
      join(root, 'pagescms.config.ts'),
      `export default { target: '${target}' }`,
    )
    const [application] = await pagescms({ root })
    for (const command of ['serve', 'build'] as const) {
      for (const mode of ['development', 'production']) {
        const config = await resolveConfig(
          { configFile: false, plugins: [application] },
          command,
          mode,
        )
        cachePaths.push(config.cacheDir)
      }
    }
  }
  expect(new Set(cachePaths).size).toBe(8)
  const [application] = await pagescms({ root })
  const configured = await resolveConfig(
    { configFile: false, cacheDir: 'custom-cache', plugins: [application] },
    'serve',
  )
  expect(configured.cacheDir).toBe(join(configured.root, 'custom-cache'))
})

it('resolves editor menus to the versions bundled with Pages CMS', async () => {
  const root = join(directory, 'menu-consumer')
  const importer = join(root, 'node_modules/@tiptap/react/dist/menus/index.js')
  mkdirSync(join(root, 'node_modules/@tiptap/react/dist/menus'), {
    recursive: true,
  })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  writeFileSync(
    join(root, 'pagescms.config.ts'),
    "export default { target: 'node' }",
  )
  for (const menu of ['bubble', 'floating']) {
    const nested = join(
      root,
      `node_modules/@tiptap/react/node_modules/@tiptap/extension-${menu}-menu`,
    )
    mkdirSync(nested, { recursive: true })
    writeFileSync(
      join(nested, 'package.json'),
      '{"version":"3.35.0","main":"index.js"}',
    )
    writeFileSync(join(nested, 'index.js'), '')
  }
  const [application] = await pagescms({ root })
  const config = await resolveConfig(
    { configFile: false, plugins: [application] },
    'serve',
  )
  const resolveId = config.createResolver()
  for (const menu of ['bubble', 'floating']) {
    const id = `@tiptap/extension-${menu}-menu`
    expect(await resolveId(id, importer)).toBe(
      fileURLToPath(import.meta.resolve(id)),
    )
  }
})

it.each([false, true])(
  'resolves router optimizer hints when the consumer owns the router: %s',
  async (ownsRouter) => {
    const root = join(directory, `router-consumer-${ownsRouter}`)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(
      join(root, 'pagescms.config.ts'),
      "export default { target: 'node' }",
    )
    if (ownsRouter) {
      const dependency = join(root, 'node_modules/@tanstack/react-router')
      mkdirSync(dependency, { recursive: true })
      writeFileSync(
        join(dependency, 'package.json'),
        '{"name":"@tanstack/react-router"}',
      )
    }
    const [application] = await pagescms({ root })
    const hint = '@tanstack/react-router > @tanstack/react-store'
    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [application],
        environments: { ssr: { optimizeDeps: { include: [hint] } } },
      },
      'serve',
    )
    expect(config.environments.ssr.optimizeDeps.include).toContain(
      ownsRouter ? hint : `pagescms > ${hint}`,
    )
  },
)

it.each(['node', 'cloudflare'])(
  'scans server and shared plugin contributions for server dependencies (%s)',
  async (target) => {
    const root = join(directory, `scan-consumer-${target}`)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    const modules = ['server.ts', 'client.ts', 'shared.ts'].map((name) =>
      join(root, name),
    )
    for (const path of modules) writeFileSync(path, 'export default () => ({})')
    writeFileSync(
      join(root, 'pagescms.config.ts'),
      `export default { target: ${JSON.stringify(target)}, plugins: [{ id: 'example', server: ${JSON.stringify(modules[0])}, client: ${JSON.stringify(modules[1])}, shared: ${JSON.stringify(modules[2])} }] }`,
    )
    const [application] = await pagescms({ root })
    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [application],
        environments: { ssr: { optimizeDeps: { entries: ['existing.ts'] } } },
      },
      'serve',
    )
    expect(config.environments.ssr.optimizeDeps.entries).toEqual(
      expect.arrayContaining(['existing.ts', modules[0], modules[2]]),
    )
    expect(config.environments.ssr.optimizeDeps.entries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('plugins.shared.ts'),
        expect.stringContaining('plugins.server.ts'),
      ]),
    )
    expect(config.environments.ssr.optimizeDeps.entries).not.toContain(
      modules[1],
    )
  },
)
