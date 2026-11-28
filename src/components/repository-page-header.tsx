import { useLingui as useUiMessages } from '@lingui/react/macro'
import { createContext, useContext, useEffect, useState } from 'react'

import { cn } from 'cn'
import { usePageScrolled } from '#/hooks/use-page-scrolled'

import type { ReactNode } from 'react'

export const RepositoryHeaderNavigation = createContext<ReactNode>(null)

export function RepositoryPageHeader({
  actions,
  children,
  className,
  refreshing = false,
  toolbar,
  stackToolbar = false,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
  refreshing?: boolean
  stackToolbar?: boolean
  toolbar?: ReactNode
}) {
  const { t: _t } = useUiMessages()

  const scrolled = usePageScrolled()
  const navigation = useContext(RepositoryHeaderNavigation)
  const [announcedRefreshing, setAnnouncedRefreshing] = useState(false)

  useEffect(() => {
    setAnnouncedRefreshing(refreshing)
  }, [refreshing])

  return (
    <header
      className={cn(
        '@container/header sticky top-0 z-20 flex min-h-12 items-center gap-2 border-b border-transparent bg-background px-3 py-2 md:min-h-16 md:flex-wrap md:gap-3 md:px-6 md:py-3',
        stackToolbar && 'flex-wrap',
        scrolled && 'border-border',
        className,
      )}
      data-slot="repository-page-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 md:block">
        {navigation ? (
          <div className="shrink-0 md:hidden">{navigation}</div>
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {toolbar ? (
        <div
          className={
            stackToolbar
              ? 'order-last w-full @min-[48rem]/header:order-none @min-[48rem]/header:w-64'
              : 'hidden md:contents'
          }
          data-slot="repository-header-toolbar"
        >
          {toolbar}
        </div>
      ) : null}
      {actions ? (
        <div
          className="flex min-w-0 shrink-0 items-center justify-end gap-1 md:max-w-full md:flex-wrap md:gap-2"
          data-slot="repository-header-actions"
        >
          {actions}
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {announcedRefreshing ? _t({ message: 'Refreshing page' }) : ''}
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
