import { ICON_NAME_PATTERN } from '#/lib/icon-name'
import type { IconSvgElement } from '@hugeicons/react'

const loaded = new Map<string, Promise<IconSvgElement | undefined>>()

const aliases: Record<string, string> = {
  'book-open': 'BookOpen01Icon',
  'folder-open': 'Folder02Icon',
}

export function loadContentIcon(
  name: string,
): Promise<IconSvgElement | undefined> {
  if (!ICON_NAME_PATTERN.test(name)) return Promise.resolve(undefined)

  const title = name.replace(
    /(^|-)([a-z])/g,
    (_match, _separator: string, letter: string) => letter.toUpperCase(),
  )
  const canonical = Object.hasOwn(aliases, name)
    ? aliases[name]
    : title.endsWith('Icon')
      ? title
      : `${title}Icon`
  let pending = loaded.get(canonical)
  if (!pending) {
    pending = fetch(
      `${import.meta.env.BASE_URL}configured-icons/${canonical}.json`,
    ).then(async (response) => {
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('application/json')
      )
        return undefined
      const value: unknown = await response.json()
      return Array.isArray(value) ? (value as IconSvgElement) : undefined
    })
    loaded.set(canonical, pending)
    void pending.catch(() => loaded.delete(canonical))
  }
  return pending
}
