import type { ClientPlugin } from '#/plugins/client'
import type { ErrorTranslation } from './errors'

/** Diagnostic catalogs are optional: a failed chunk must not disable the interface. */
export async function loadErrorCatalogs(plugins: readonly ClientPlugin[]) {
  const groups = await Promise.all(
    plugins.map(async (plugin) => {
      if (!plugin.errors) return []
      try {
        const value: unknown = await plugin.errors()
        if (!Array.isArray(value))
          throw new Error('Expected diagnostic entries')
        for (const input of value as unknown[]) {
          if (!input || typeof input !== 'object')
            throw new Error('Invalid diagnostic entry')
          const entry = input as Partial<ErrorTranslation>
          if (
            typeof entry.source !== 'string' ||
            typeof entry.message?.id !== 'string' ||
            !entry.message.id.startsWith(`${plugin.id}.`) ||
            (entry.pattern !== undefined &&
              !(entry.pattern instanceof RegExp)) ||
            (entry.values !== undefined &&
              (!Array.isArray(entry.values) ||
                !entry.values.every((key) => typeof key === 'string')))
          )
            throw new Error('Invalid diagnostic entry')
        }
        return value as ErrorTranslation[]
      } catch (error) {
        console.warn(`Error translations unavailable for ${plugin.id}`, error)
        return []
      }
    }),
  )
  return groups.flat()
}
