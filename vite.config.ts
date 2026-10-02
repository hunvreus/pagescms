import {
  createLogger,
  defineConfig,
  loadEnv,
  searchForWorkspaceRoot,
} from 'vite'
import { fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

import {
  resolveApplicationAliases,
  resolveDeploymentEntries,
} from './deployment.config.ts'

const cloudflareBuild = process.env.PAGESCMS_CLOUDFLARE === 'true'
const e2eRequestServices = fileURLToPath(
  new URL('./tests/e2e/request-services.server.ts', import.meta.url),
)
const nodeRequestServices = fileURLToPath(
  new URL('./src/server/request-services-bootstrap.server.ts', import.meta.url),
)
const cloudflareRequestServices = fileURLToPath(
  new URL(
    './src/server/request-services-bootstrap.cloudflare.server.ts',
    import.meta.url,
  ),
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

const config = defineConfig(({ mode }) => {
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
      ...(!tanStackDevtoolsDisabled ? devtools() : []),
      ...(cloudflareBuild
        ? [cloudflare({ viteEnvironment: { name: 'ssr' } })]
        : []),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
