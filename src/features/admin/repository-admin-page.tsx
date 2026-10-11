import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { cn } from '#/lib/utils'

import type { ReactNode } from 'react'

export function RepositoryAdminPage({
  title,
  actions,
  children,
  className,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(
    null,
  )
  return (
    <HeaderActionsContext value={headerActions}>
      <div className="-m-4 md:-m-6">
        <RepositoryPageHeader
          actions={
            <>
              {actions}
              <div ref={setHeaderActions} className="contents" />
            </>
          }
        >
          <RepositoryPageTitle>{title}</RepositoryPageTitle>
        </RepositoryPageHeader>
        <div
          className={cn('mx-auto max-w-5xl space-y-6 p-4 md:p-6', className)}
        >
          {children}
        </div>
      </div>
    </HeaderActionsContext>
  )
}

const HeaderActionsContext = createContext<HTMLDivElement | null>(null)

export function RepositoryAdminHeaderActions({
  children,
}: {
  children: ReactNode
}) {
  const target = useContext(HeaderActionsContext)
  return target ? createPortal(children, target) : null
}
