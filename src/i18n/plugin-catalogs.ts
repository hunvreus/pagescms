import type { Messages } from '@lingui/core'
import type { ClientPlugin } from '#/plugins/client'

function readCatalog(input: unknown, plugin: string): Messages {
  if (
    !input ||
    typeof input !== 'object' ||
    !('messages' in input) ||
    !input.messages ||
    typeof input.messages !== 'object' ||
    Array.isArray(input.messages)
  )
    throw new Error(`Invalid translation catalog in plugin ${plugin}`)
  for (const [id, value] of Object.entries(input.messages)) {
    if (!id.startsWith(`${plugin}.`) || id.length <= plugin.length + 1)
      throw new Error(`Invalid translation ID ${id} in plugin ${plugin}`)
    if (
      typeof value !== 'string' &&
      (!Array.isArray(value) ||
        !value.every(
          (token) =>
            typeof token === 'string' ||
            (Array.isArray(token) &&
              typeof token[0] === 'string' &&
              token.length <= 3 &&
              (token[1] === undefined || typeof token[1] === 'string')),
        ))
    )
      throw new Error(`Invalid translation message ${id} in plugin ${plugin}`)
  }
  return input.messages as Messages
}

function empty(value: Messages[string]) {
  return (
    value === '' ||
    (Array.isArray(value) &&
      (value.length === 0 || (value.length === 1 && value[0] === '')))
  )
}

export async function loadPluginCatalogs(
  plugins: readonly ClientPlugin[],
  locale: string,
  source: Messages | Promise<Messages>,
): Promise<Messages> {
  const [core, catalogs] = await Promise.all([
    source,
    Promise.all(
      plugins.map(async (plugin) => {
        const loaders = plugin.translations
        if (!loaders) return null
        const selected = locale === 'en' ? undefined : loaders[locale]
        const [englishModule, translatedModule] = await Promise.all([
          loaders.en(),
          selected?.(),
        ])
        const english = readCatalog(englishModule, plugin.id)
        const translated = selected
          ? readCatalog(translatedModule, plugin.id)
          : {}
        const labels = [
          ...Object.values(plugin.repositoryPages ?? {}).map(
            (page) => page.label,
          ),
          ...Object.values(plugin.pages ?? {}).map((page) => page.title),
          ...(plugin.ui?.accountSettings ?? []).map((section) => section.label),
        ]
        for (const label of labels)
          if (
            typeof label !== 'string' &&
            (!Object.hasOwn(english, label.id) || empty(english[label.id]))
          )
            throw new Error(
              `Missing English translation ${label.id} in plugin ${plugin.id}`,
            )
        // Empty translations have the same fallback behavior as absent entries.
        return {
          ...english,
          ...Object.fromEntries(
            Object.entries(translated).filter(([, value]) => !empty(value)),
          ),
        }
      }),
    ),
  ])
  const combined = Object.assign(Object.create(null) as Messages, core)
  for (const catalog of catalogs) {
    if (!catalog) continue
    for (const [id, value] of Object.entries(catalog)) {
      if (Object.hasOwn(combined, id))
        throw new Error(`Invalid translation ID ${id}: catalog collision`)
      combined[id] = value
    }
  }
  return combined
}
