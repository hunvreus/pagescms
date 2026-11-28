import { setupI18n } from '@lingui/core'
import { expect, it, vi } from 'vitest'
import { activateLocale } from './catalogs'

vi.mock('#pagescms/deployment/client', () => ({
  default: {
    plugins: [
      { id: 'test', translations: { en: async () => ({ messages: {} }) } },
    ],
  },
}))
vi.mock('../locales/fr/messages.po', () => {
  throw new Error('Core catalog unavailable')
})
vi.mock('./plugin-catalogs', async (original) => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  return original()
})
it('observes a fast core failure while the plugin loader is pending and preserves the current language', async () => {
  const i18n = setupI18n({
    locale: 'en',
    messages: { en: { previous: ['Previous'] } },
  })
  await expect(activateLocale(i18n, 'fr')).rejects.toThrow()
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(i18n.locale).toBe('en')
  expect(i18n._('previous')).toBe('Previous')
})
