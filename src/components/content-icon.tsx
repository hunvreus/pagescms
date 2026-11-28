import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import type { IconSvgElement } from '@hugeicons/react'

async function loadConfiguredIcon(name: string) {
  const { loadContentIcon } = await import('#/lib/content-icon-loader')
  return loadContentIcon(name)
}

/** Configured icons are local lazy chunks; unknown or unavailable icons use the default. */
export function ContentIcon({
  name,
  fallback: Fallback,
  className,
  'data-icon': position,
}: {
  name?: string
  fallback: IconSvgElement
  className?: string
  'data-icon'?: 'inline-start' | 'inline-end'
}) {
  const [icon, setIcon] = useState<{ name: string; node: IconSvgElement }>()
  useEffect(() => {
    if (!name) return
    let cancelled = false
    void loadConfiguredIcon(name)
      .then((node) => {
        if (!cancelled && Array.isArray(node) && node.length > 0)
          setIcon({ name, node })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [name])
  return icon && icon.name === name ? (
    <HugeiconsIcon
      icon={icon.node}
      className={className}
      data-icon={position}
      aria-hidden="true"
    />
  ) : (
    <HugeiconsIcon
      icon={Fallback}
      className={className}
      data-icon={position}
      aria-hidden="true"
    />
  )
}
