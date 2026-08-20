import { defineConfig } from 'vite'
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

const config = defineConfig({
  envDir: process.env.PAGESCMS_E2E === 'true' ? false : undefined,
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
    devtools(),
    ...(cloudflareBuild
      ? [cloudflare({ viteEnvironment: { name: 'ssr' } })]
      : []),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
