import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'
import { fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

import {
  CLIENT_DEPLOYMENT_ALIAS,
  resolveDeploymentEntries,
  SERVER_DEPLOYMENT_ALIAS,
} from './deployment.config.ts'

const cloudflareBuild = process.env.PAGESCMS_CLOUDFLARE === 'true'
const e2eRequestServices = fileURLToPath(
  new URL('./tests/e2e/request-services.server.ts', import.meta.url),
)

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

  return {
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
      tsconfigPaths: true,
      dedupe: [
        'react',
        'react-dom',
        '@tanstack/react-query',
        '@tanstack/react-router',
      ],
      alias: {
        [SERVER_DEPLOYMENT_ALIAS]: deploymentEntries.server,
        [CLIENT_DEPLOYMENT_ALIAS]: deploymentEntries.client,
        ...(process.env.PAGESCMS_E2E === 'true'
          ? {
              '#/server/request-services-bootstrap.server': e2eRequestServices,
            }
          : {}),
      },
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
