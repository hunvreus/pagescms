import { loadErrorCatalogs } from './error-catalogs'
import { registerErrorTranslations } from './errors'
import deployment from '#pagescms/deployment/client'
import type { I18n } from '@lingui/core'
import type { Locale } from './locale'

export async function activateLocale(i18n: I18n, locale: Locale) {
  const loaders = {
    en: () => import('../locales/en/messages.po'),
    fr: () => import('../locales/fr/messages.po'),
    es: () => import('../locales/es/messages.po'),
    'pt-BR': () => import('../locales/pt-BR/messages.po'),
    'zh-CN': () => import('../locales/zh-CN/messages.po'),
  }
  const source = loaders[locale]().then((module) => module.messages)
  // Observe both promises immediately: a fast core failure must not become an
  // unhandled rejection while the plugin loader chunk is still downloading.
  const [messages, combined, coreErrors, pluginErrors] = await Promise.all([
    source,
    deployment.plugins.some((plugin) => plugin.translations)
      ? import('./plugin-catalogs').then((module) =>
          module.loadPluginCatalogs(deployment.plugins, locale, source),
        )
      : undefined,
    import('./known-errors')
      .then((module) => module.errors)
      .catch((error) => {
        console.warn('Error translations unavailable', error)
        return []
      }),
    loadErrorCatalogs(deployment.plugins),
  ])
  registerErrorTranslations(i18n, [...coreErrors, ...pluginErrors])
  i18n.loadAndActivate({ locale, messages: combined ?? messages })
}
