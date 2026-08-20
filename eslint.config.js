//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      '_legacy/**',
      '.output/**',
      '.wrangler/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/routeTree.gen.ts',
      'worker-configuration.d.ts',
      'eslint.config.js',
      'prettier.config.js',
    ],
  },
]
