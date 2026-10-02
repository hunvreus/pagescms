//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

const projectRules = {
  'import/no-cycle': 'off',
  'import/order': 'off',
  'sort-imports': 'off',
  '@typescript-eslint/array-type': 'off',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/require-await': 'off',
}

export default [
  ...tanstackConfig.map((config) =>
    config.plugins
      ? { ...config, rules: { ...config.rules, ...projectRules } }
      : config,
  ),
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
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/server/http.ts'],
    rules: {
      'no-console': ['error', { allow: ['log', 'warn'] }],
    },
  },
  {
    files: ['src/server/http.ts'],
    rules: { 'no-console': 'off' },
  },
]
