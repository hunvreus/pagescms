import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const cloudflareRuntime = process.env.PAGESCMS_RUNTIME === 'cloudflare'
const e2eRequestServices = fileURLToPath(
  new URL('./tests/e2e/request-services.server.ts', import.meta.url),
)
const cloudflareRequestServices = fileURLToPath(
  new URL(
    './src/server/cloudflare-request-services.server.ts',
    import.meta.url,
  ),
)

const config = defineConfig({
  envDir: process.env.PAGESCMS_E2E === 'true' ? false : undefined,
  resolve: {
    tsconfigPaths: true,
    alias: {
      ...(process.env.PAGESCMS_E2E === 'true'
        ? {
            '#/server/runtime-request-services.server': e2eRequestServices,
          }
        : {}),
      ...(cloudflareRuntime
        ? {
            '#/server/runtime-request-services.server':
              cloudflareRequestServices,
          }
        : {}),
    },
  },
  plugins: [
    devtools(),
    ...(cloudflareRuntime
      ? [cloudflare({ viteEnvironment: { name: 'ssr' } })]
      : []),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
