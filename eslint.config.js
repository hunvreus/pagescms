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
      '.tmp/**',
      '.output/**',
      '.wrangler/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/routeTree.gen.ts',
      'src/locales/**/messages.js',
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
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/server/db/**',
      'src/server/auth/**',
      '**/*.test.{ts,tsx}',
      '**/__tests__/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['drizzle-orm', 'drizzle-orm/**'],
              allowTypeImports: true,
              message:
                'Runtime Drizzle imports belong in server/db or server/auth.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/{client,components,features,routes,hooks,i18n,lib,shared}/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.server.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['#/server/**', '../server/**', '../../server/**'],
              allowTypeImports: true,
              message: 'Browser code may import server types only.',
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/**'],
              allowTypeImports: true,
              message:
                'Runtime Drizzle imports belong in server/db or server/auth.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/server/http.ts'],
    rules: { 'no-console': 'off' },
  },
]
