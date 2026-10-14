import type { IconNode } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'

type IconName = keyof typeof dynamicIconImports
const loaded = new Map<string, Promise<IconNode>>()

/** The catalogue map itself is only downloaded when a configured icon is requested. */
export function loadContentIcon(name: string): Promise<IconNode | undefined> {
  if (!Object.hasOwn(dynamicIconImports, name))
    return Promise.resolve(undefined)
  let pending = loaded.get(name)
  if (!pending) {
    pending = dynamicIconImports[name as IconName]().then(
      (module) => module.__iconNode,
    )
    loaded.set(name, pending)
    void pending.catch(() => loaded.delete(name))
  }
  return pending
}
