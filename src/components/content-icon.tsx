import { useEffect, useState } from 'react'
import { Icon } from 'lucide-react'
import type { IconNode, LucideIcon } from 'lucide-react'
/** Configured icons are local lazy chunks; unknown or unavailable icons use the default. */
export function ContentIcon({
  name,
  fallback: Fallback,
  className,
}: {
  name?: string
  fallback: LucideIcon
  className?: string
}) {
  const [icon, setIcon] = useState<{ name: string; node: IconNode }>()
  useEffect(() => {
    if (!name || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) return
    let cancelled = false
    void import('#/lib/content-icon-loader')
      .then(({ loadContentIcon }) => loadContentIcon(name))
      .then((node) => {
        if (!cancelled && node) setIcon({ name, node })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [name])
  return icon && icon.name === name ? (
    <Icon iconNode={icon.node} className={className} aria-hidden="true" />
  ) : (
    <Fallback className={className} aria-hidden="true" />
  )
}
