import { cloudflareProjectRoutes } from './cloudflare-project-routes'
import { configuredIcons } from './configured-icons'
import { lingui } from '@lingui/vite-plugin'
import { configuredIconDirectory } from './icon-path'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { nodeApiMiddleware } from './node-middleware'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadPackageConfig } from './load'
import { generatePackageEntries } from './generate'
import { searchForWorkspaceRoot } from 'vite'
import type { PluginOption } from 'vite'
import type { PluginDescriptor } from './config'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Vite module IDs use forward slashes on every platform (`C:/app/x.ts`).
 * Unlike Vite's `normalizePath`, this converts backslashes on every platform
 * so comparisons stay consistent; the generator rejects backslashes anyway.
 */
export function toVitePath(path: string) {
  return posix.normalize(path.replace(/\\/g, '/'))
}

/** Browser-loaded plugin module directories; server modules never need serving. */
export function pluginBrowserDirectories(plugins: readonly PluginDescriptor[]) {
  return plugins.flatMap((plugin) =>
    [plugin.client, plugin.shared]
      .filter((path): path is string => Boolean(path))
      .map(dirname),
  )
}

/** Matches Vite module IDs (any query stripped) that must stay out of the client. */
export function createServerOnlyMatcher(plugins: readonly PluginDescriptor[]) {
  const modules = new Set(
    plugins.flatMap((plugin) =>
      plugin.server
        ? [
            toVitePath(plugin.server),
            ...(existsSync(plugin.server)
              ? [toVitePath(realpathSync(plugin.server))]
              : []),
          ]
        : [],
    ),
  )
  return (id: string) => {
    const path = id.split('?')[0]
    if (!path) return false
    const normalized = toVitePath(path)
    return (
      modules.has(normalized) ||
      normalized.includes('/src/server/') ||
      /\.server\.[cm]?[jt]sx?$/.test(normalized) ||
      (existsSync(path) && modules.has(toVitePath(realpathSync(path))))
    )
  }
}

/**
 * Setting `server.fs.allow` replaces Vite's workspace-root default, so keep it
 * and add the package, generated entries and plugin browser modules, which can
 * live outside the workspace (linked or global installs).
 */
export function allowedDirectories(
  root: string,
  generated: string,
  plugins: readonly PluginDescriptor[],
) {
  return [
    ...new Set(
      [
        searchForWorkspaceRoot(root),
        packageRoot,
        generated,
        ...pluginBrowserDirectories(plugins),
      ].map(toVitePath),
    ),
  ]
}

/** Build the installed application without writing into its package directory. */
export async function pagescms(
  options: {
    root?: string
    remoteLibsql?: boolean
  } = {},
): Promise<PluginOption[]> {
  const root = resolve(options.root ?? process.cwd())
  const generated = resolve(root, '.pagescms')
  mkdirSync(generated, { recursive: true })
  const sourceDirectory = resolve(packageRoot, 'src')
  // Compared against Vite IDs and emitted as import specifiers: forward slashes only.
  const source = toVitePath(sourceDirectory)
  const sourcePath = (path: string) => `${source}/${path}`
  const configuration = await loadPackageConfig(root)
  const { target } = configuration
  let isDev = false
  const serverOnly = createServerOnlyMatcher(configuration.plugins)
  const entries = generatePackageEntries(configuration, {
    coreImportPrefix: `${source}/`,
  })
  const server = resolve(generated, 'plugins.server.ts')
  const client = resolve(generated, 'plugins.browser.ts')
  const shared = resolve(generated, 'plugins.shared.ts')
  writeFileSync(server, entries.server)
  writeFileSync(client, entries.client)
  writeFileSync(shared, entries.shared)
  const style = resolve(generated, 'styles.css')
  const routeTree = resolve(generated, 'routeTree.gen.ts')
  const styleSources = [
    source,
    ...pluginBrowserDirectories(configuration.plugins).map(toVitePath),
  ]
  writeFileSync(
    style,
    [
      `@import ${JSON.stringify(sourcePath('styles.css'))};`,
      ...styleSources.map((path) => `@source ${JSON.stringify(path)};`),
    ].join('\n'),
  )
  return [
    {
      name: 'pagescms:application',
      enforce: 'pre',
      configureServer(viteServer) {
        if (target !== 'node') return
        viteServer.middlewares.use(
          nodeApiMiddleware(
            async () =>
              (await viteServer.ssrLoadModule(sourcePath('server/index.ts')))
                .default,
          ),
        )
      },
      configResolved(config) {
        isDev = config.command === 'serve'
        for (const [name, environment] of Object.entries(config.environments)) {
          if (name === 'ssr') {
            const scannedEntries = environment.optimizeDeps.entries ?? []
            environment.optimizeDeps.entries = [
              ...(Array.isArray(scannedEntries)
                ? scannedEntries
                : [scannedEntries]),
              server,
              shared,
              ...configuration.plugins.flatMap((plugin) =>
                [plugin.server, plugin.shared].filter((path): path is string =>
                  Boolean(path),
                ),
              ),
              sourcePath(
                target === 'cloudflare'
                  ? 'server/context-cloudflare.ts'
                  : 'server/context-node.ts',
              ),
            ]
          }
          // Keep application modules in Vite's transform pipeline for aliases.
          environment.optimizeDeps.exclude = [
            ...new Set([
              ...(environment.optimizeDeps.exclude ?? []),
              'pagescms',
              '#pagescms/deployment/server',
              '#pagescms/deployment/client',
              'virtual:pagescms-request-services-bootstrap',
            ]),
          ]
          environment.optimizeDeps.include =
            environment.optimizeDeps.include?.map((id) =>
              id === '@tanstack/react-router > @tanstack/react-store' &&
              !existsSync(
                resolve(
                  root,
                  'node_modules/@tanstack/react-router/package.json',
                ),
              )
                ? `pagescms > ${id}`
                : id,
            )
        }
      },
      transform(_code, id) {
        if (
          this.environment.name === 'client' &&
          !toVitePath(id).startsWith(`${source}/`) &&
          serverOnly(id)
        ) {
          this.error(
            `Import denied in client environment: server-only plugin module ${id}`,
          )
        }
      },
      generateBundle(_options, bundle) {
        if (this.environment.name !== 'client') return
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue
          for (const id of Object.keys(output.modules)) {
            if (serverOnly(id))
              this.error(
                `Import denied in client environment: server-only module ${id}`,
              )
          }
        }
      },
      resolveId(id, importer) {
        if (id === '#pagescms/deployment/client')
          return this.environment.name === 'client' ? client : shared
        const importerPath =
          importer === undefined ? undefined : toVitePath(importer)
        if (
          target === 'node' &&
          id === '@libsql/client' &&
          importerPath?.split('?')[0] !== sourcePath('package/libsql.mjs')
        ) {
          return {
            id: isDev
              ? sourcePath('package/libsql.mjs')
              : options.remoteLibsql
                ? 'pagescms/libsql-web'
                : 'pagescms/libsql',
            external: true,
          }
        }
        if (importerPath?.startsWith(`${source}/`) && id.startsWith('#/'))
          return this.resolve(sourcePath(id.slice(2)), importer, {
            skipSelf: true,
          })
        if (
          importerPath?.split('?')[0] === sourcePath('router.tsx') &&
          id === './routeTree.gen'
        )
          return toVitePath(routeTree)
        if (
          (id === '../styles.css' &&
            importerPath?.startsWith(`${source}/routes/`)) ||
          id === sourcePath('styles.css')
        )
          return toVitePath(style)
      },
      config: (userConfig, { command, mode }) => ({
        root: packageRoot,
        build: {
          manifest: true,
          outDir: resolve(
            root,
            target === 'cloudflare'
              ? 'dist'
              : userConfig.build?.ssr
                ? 'dist/server'
                : 'dist/client',
          ),
          emptyOutDir: true,
        },
        // A build or a different runtime must not replace a running dev
        // server's optimized chunks while its module graph still refers to them.
        cacheDir:
          userConfig.cacheDir ??
          resolve(
            root,
            'node_modules/.vite',
            `pagescms-${target}-${command}-${mode}`,
          ),
        publicDir: userConfig.build?.ssr
          ? false
          : resolve(packageRoot, 'public'),
        resolve: {
          dedupe: [
            'react',
            'react-dom',
            '@lingui/core',
            '@lingui/react',
            '@tiptap/pm',
            'prosemirror-model',
            '@tanstack/react-router',
            '@tanstack/react-query',
            // Auth plugins supplied by deployment plugins must share the core
            // Better Auth runtime (error classes, request state, adapters).
            'better-auth',
            'better-call',
            '@better-auth/core',
          ],
          alias: [
            ...['bubble', 'floating'].map((menu) => ({
              find: new RegExp(`^@tiptap/extension-${menu}-menu$`),
              replacement: fileURLToPath(
                import.meta.resolve(`@tiptap/extension-${menu}-menu`),
              ),
            })),
            {
              find: '#pagescms/configured-icons',
              replacement: configuredIconDirectory(),
            },
            { find: '#pagescms/deployment/server', replacement: server },
            {
              find: 'virtual:pagescms-request-services-bootstrap',
              replacement: resolve(
                source,
                target === 'cloudflare'
                  ? 'server/context-cloudflare.ts'
                  : 'server/context-node.ts',
              ),
            },
          ],
        },
        ssr: {
          noExternal:
            target !== 'node' || command !== 'serve' ? true : undefined,
          external:
            target === 'node' ? ['pagescms/libsql', 'pagescms/libsql-web'] : [],
        },
        ...(target === 'cloudflare'
          ? {
              environments: {
                worker: {
                  optimizeDeps: { include: ['pagescms > safe-regex2'] },
                },
              },
            }
          : {}),
        optimizeDeps: { exclude: ['pagescms'] },
        server: {
          port: userConfig.server?.port ?? 3000,
          forwardConsole: false,
          fs: {
            allow: allowedDirectories(root, generated, configuration.plugins),
          },
        },
      }),
    },
    configuredIcons(),
    ...(target === 'cloudflare'
      ? [
          cloudflareProjectRoutes(),
          (await import('@cloudflare/vite-plugin')).cloudflare({
            viteEnvironment: { name: 'worker' },
            persistState: { path: resolve(root, '.wrangler/state') },
            configPath:
              process.env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH ||
              ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']
                .map((name) => resolve(root, name))
                .find(existsSync),
            config: (config) => ({
              assets: {
                ...config.assets,
                binding: 'ASSETS',
                not_found_handling: 'single-page-application',
                run_worker_first:
                  config.assets?.run_worker_first === true
                    ? true
                    : ['/api/*', '/.well-known/*'],
              },
            }),
          }),
        ]
      : []),
    tailwindcss(),
    tanstackRouter({
      target: 'react',
      routesDirectory: sourcePath('routes'),
      generatedRouteTree: routeTree,
      routeFileIgnorePattern: '(^api\\.|\\.test\\.)',
      autoCodeSplitting: true,
    }),
    react(),
    ...lingui({
      configPath: resolve(sourceDirectory, 'i18n/lingui.config.mjs'),
      macroTransform: true,
    }),
  ]
}
