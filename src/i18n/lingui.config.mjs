import { fileURLToPath } from 'node:url'
import { formatter } from '@lingui/format-po'

export default {
  locales: ['en', 'fr', 'es', 'pt-BR', 'zh-CN'],
  sourceLocale: 'en',
  fallbackLocales: { default: 'en' },
  catalogs: [
    {
      path: fileURLToPath(
        new URL('../locales/{locale}/messages', import.meta.url),
      ),
      include: [fileURLToPath(new URL('../', import.meta.url))],
      exclude: ['**/*.test.*', '**/routeTree.gen.ts'],
    },
  ],
  format: formatter({ lineNumbers: false }),
}
