import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { cn } from 'cn'

import type { ReactNode } from 'react'

export function RepositoryAdminPage({
  title,
  actions,
  toolbar,
  children,
  className,
}: {
  title: string
  actions?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(
    null,
  )
  const [headerToolbar, setHeaderToolbar] = useState<HTMLDivElement | null>(
    null,
  )
  return (
    <HeaderActionsContext
      value={{ actions: headerActions, toolbar: headerToolbar }}
    >
      <div className="-m-4 md:-m-6">
        <RepositoryPageHeader
          toolbar={
            <>
              {toolbar}
              <div ref={setHeaderToolbar} className="contents" />
            </>
          }
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

const HeaderActionsContext = createContext<{
  actions: HTMLDivElement | null
  toolbar: HTMLDivElement | null
} | null>(null)

export function RepositoryAdminHeaderActions({
  children,
  placement = 'actions',
}: {
  children: ReactNode
  placement?: 'actions' | 'toolbar'
}) {
  const target = useContext(HeaderActionsContext)?.[placement]
  return target ? createPortal(children, target) : null
}
