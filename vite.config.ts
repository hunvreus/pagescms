import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const e2eRequestServices = fileURLToPath(
  new URL('./tests/e2e/request-services.server.ts', import.meta.url),
)

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias:
      process.env.PAGESCMS_E2E === 'true'
        ? {
            '#/server/cloudflare-request-services.server': e2eRequestServices,
          }
        : undefined,
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
