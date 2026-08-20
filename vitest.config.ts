import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'json-summary'],
    },
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**', '_legacy/**'],
  },
})
