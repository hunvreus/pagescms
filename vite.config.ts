import { cloudflareProjectRoutes } from './src/package/cloudflare-project-routes'
import { configuredIcons } from './src/package/configured-icons'
import { lingui } from '@lingui/vite-plugin'
import {
  createLogger,
  defineConfig,
  loadEnv,
  searchForWorkspaceRoot,
} from 'vite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { nodeApiMiddleware } from './src/package/node-middleware'
import type { Plugin } from 'vite'

import {
  resolveApplicationAliases,
  resolveDeploymentEntries,
} from './deployment.config.ts'

const cloudflareBuild = process.env.PAGESCMS_CLOUDFLARE === 'true'
const e2eRequestServices = fileURLToPath(
  new URL('./tests/e2e/request-services.server.ts', import.meta.url),
)
const nodeRequestServices = fileURLToPath(
  new URL('./src/server/context-node.ts', import.meta.url),
)
const cloudflareRequestServices = fileURLToPath(
  new URL('./src/server/context-cloudflare.ts', import.meta.url),
)

function isClientDisconnect(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  if ('code' in error && error.code === 'ECONNRESET') return true
  return isClientDisconnect(error.cause)
}

function createDevelopmentLogger() {
  const logger = createLogger()
  const logError = logger.error.bind(logger)
  logger.error = (message, options) => {
    if (isClientDisconnect(options?.error)) return
    logError(message, options)
  }
  return logger
}

const config = defineConfig(({ command, mode, isSsrBuild }) => {
  if (cloudflareBuild && command === 'build')
    process.umask(process.umask() | 0o077)
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const tanStackDevtoolsDisabled = env.VITE_DISABLE_TANSTACK_DEVTOOLS === 'true'
  const deploymentEntries = resolveDeploymentEntries(
    {
      PAGESCMS_DEPLOYMENT_CLIENT: process.env.PAGESCMS_DEPLOYMENT_CLIENT,
      PAGESCMS_DEPLOYMENT_SERVER: process.env.PAGESCMS_DEPLOYMENT_SERVER,
    },
    process.cwd(),
  )
  const requestServicesBootstrap =
    process.env.PAGESCMS_E2E === 'true'
      ? e2eRequestServices
      : cloudflareBuild
        ? cloudflareRequestServices
        : nodeRequestServices

  return {
    ...(cloudflareBuild
      ? {
          environments: {
            worker: { optimizeDeps: { include: ['safe-regex2'] } },
          },
        }
      : {}),
    publicDir: isSsrBuild ? false : undefined,
    build: {
      manifest: true,
      ...(isSsrBuild
        ? { rollupOptions: { output: { entryFileNames: 'server.js' } } }
        : {}),
    },
    cacheDir:
      process.env.PAGESCMS_E2E === 'true'
        ? 'node_modules/.vite-e2e'
        : undefined,
    customLogger: createDevelopmentLogger(),
    envDir: process.env.PAGESCMS_E2E === 'true' ? false : undefined,
    server: {
      // Vite enables browser-console forwarding automatically when it detects an
      // agent. TanStack Start also forwards server logs to the browser in dev,
      // so leaving both directions enabled creates a recursive logging loop that
      // eventually resets in-flight server-function requests.
      forwardConsole: false,
      fs: {
        allow: [
          searchForWorkspaceRoot(process.cwd()),
          ...deploymentEntries.allowedDirectories,
        ],
      },
    },
    resolve: {
      dedupe: [
        'react',
        'react-dom',
        '@lingui/core',
        '@lingui/react',
        '@tiptap/pm',
        '@tanstack/react-query',
        '@tanstack/react-router',
      ],
      alias: [
        {
          find: 'virtual:pagescms-request-services-bootstrap',
          replacement: requestServicesBootstrap,
        },
        ...resolveApplicationAliases(deploymentEntries, process.cwd()),
      ],
    },
    plugins: [
      configuredIcons(),
      ...(!cloudflareBuild
        ? [
            {
              name: 'pagescms-node-api',
              configureServer(server) {
                server.middlewares.use(
                  nodeApiMiddleware(
                    async () =>
                      (await server.ssrLoadModule('/src/server/index.ts'))
                        .default,
                  ),
                )
              },
              configurePreviewServer(server) {
                server.middlewares.use(
                  nodeApiMiddleware(
                    async () =>
                      (
                        await import(
                          pathToFileURL(resolve('dist/server/server.js')).href
                        )
                      ).default,
                  ),
                )
              },
            } satisfies Plugin,
          ]
        : []),
      ...(!tanStackDevtoolsDisabled ? devtools() : []),
      ...(cloudflareBuild
        ? [
            cloudflareProjectRoutes(),
            cloudflare({ viteEnvironment: { name: 'worker' } }),
          ]
        : []),
      tailwindcss(),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routeFileIgnorePattern: '(^api\\.|\\.test\\.)',
      }),
      viteReact(),
      lingui({
        configPath: './src/i18n/lingui.config.mjs',
        macroTransform: true,
      }),
    ],
  }
})

export default config
