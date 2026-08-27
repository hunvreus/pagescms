import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const cloudflareBuild = process.env.PAGESCMS_CLOUDFLARE === 'true'
const e2eRequestServices = fileURLToPath(
  new URL('./tests/e2e/request-services.server.ts', import.meta.url),
)

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const tanStackDevtoolsDisabled = env.VITE_DISABLE_TANSTACK_DEVTOOLS === 'true'

  return {
    envDir: process.env.PAGESCMS_E2E === 'true' ? false : undefined,
    server: {
      // Vite enables browser-console forwarding automatically when it detects an
      // agent. TanStack Start also forwards server logs to the browser in dev,
      // so leaving both directions enabled creates a recursive logging loop that
      // eventually resets in-flight server-function requests.
      forwardConsole: false,
    },
    resolve: {
      tsconfigPaths: true,
      alias: {
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
