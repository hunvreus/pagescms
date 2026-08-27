import { useEffect, useState } from 'react'

import { cn } from '#/lib/utils'

import type { ReactNode } from 'react'

export function RepositoryPageHeader({
  actions,
  children,
  className,
  refreshing = false,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
  refreshing?: boolean
}) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-12 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-transparent bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:top-0 md:px-6',
        scrolled && 'border-border',
        className,
      )}
      data-slot="repository-page-header"
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {refreshing ? 'Refreshing page' : ''}
      </span>
    </header>
  )
}

export function RepositoryPageTitle({
  children,
  description,
}: {
  children: ReactNode
  description?: ReactNode
}) {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-lg font-medium">{children}</h1>
      {description ? (
        <p className="truncate text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
