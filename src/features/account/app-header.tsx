import { useLingui as useUiMessages } from '@lingui/react/macro'
import { Skeleton } from '#/components/ui/skeleton'
import { AboutDialog } from '#/features/dashboard/about-dialog'
import type { CurrentUser } from '#/lib/authentication'
import { AccountMenu } from './account-menu'

// Stop sticking before the controls can overlap the 808px content column.
const headerClassName =
  'flex h-12 shrink-0 items-center justify-between px-4 xl:pointer-events-none xl:sticky xl:top-0 xl:z-30'

export function AppHeader({
  isAdmin,
  user,
}: {
  isAdmin: boolean
  user: CurrentUser
}) {
  return (
    <header className={headerClassName}>
      <div className="pointer-events-auto flex items-center">
        <AboutDialog />
      </div>
      <div className="pointer-events-auto flex items-center">
        <AccountMenu isAdmin={isAdmin} user={user} />
      </div>
    </header>
  )
}

export function AppHeaderSkeleton() {
  const { t: _t } = useUiMessages()

  return (
    <header
      className={headerClassName}
      aria-label={_t({ message: 'Loading account menu' })}
    >
      <div className="pointer-events-auto flex items-center">
        <AboutDialog />
      </div>
      <div className="flex size-7 items-center justify-center">
        <Skeleton className="size-6 rounded-full" />
      </div>
    </header>
  )
}
