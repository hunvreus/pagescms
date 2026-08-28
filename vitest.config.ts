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
  resolve: {
    alias: [...resolveApplicationAliases(deploymentEntries, process.cwd())],
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      '@tanstack/react-router',
    ],
  },
  test: {
    coverage: {
      reporter: ['text', 'json-summary'],
    },
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**', '_legacy/**'],
  },
})
