import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

import {
  resolveApplicationAliases,
  resolveDeploymentEntries,
} from './deployment.config.ts'

const deploymentEntries = resolveDeploymentEntries(
  {
    PAGESCMS_DEPLOYMENT_CLIENT: process.env.PAGESCMS_DEPLOYMENT_CLIENT,
    PAGESCMS_DEPLOYMENT_SERVER: process.env.PAGESCMS_DEPLOYMENT_SERVER,
  },
  process.cwd(),
)

export default defineConfig({
  plugins: [
    lingui({
      configPath: './src/i18n/lingui.config.mjs',
      macroTransform: true,
    }),
  ],
  resolve: {
    alias: [...resolveApplicationAliases(deploymentEntries, process.cwd())],
    dedupe: [
      'react',
      'react-dom',
      '@lingui/core',
      '@lingui/react',
      '@tanstack/react-query',
      '@tanstack/react-router',
    ],
  },
  test: {
    coverage: {
      reporter: ['text', 'json-summary'],
    },
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**', '.tmp/**'],
  },
})
