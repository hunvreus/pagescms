import { useLingui as useUiMessages } from '@lingui/react/macro'
import { accountTitle, adminTitle } from '#/features/account/account-messages'
import type { MessageDescriptor } from '@lingui/core'
import { useLingui } from '@lingui/react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { SettingsBackLink } from './settings-back-link'
import { HugeiconsIcon } from '@hugeicons/react'
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarSeparator,
  useSidebar,
} from '#/components/ui/sidebar'
import { AccountMenu } from '#/features/account/account-menu'
import { AboutDialog } from '#/features/dashboard/about-dialog'
import { Skeleton } from '#/components/ui/skeleton'
import { useSidebarScroll } from '#/hooks/use-sidebar-scroll'
import { cn } from 'cn'
import type { CurrentUser } from '#/lib/authentication'

type SettingsLayoutProps = {
  area: 'Account' | 'Admin'
  items: readonly {
    id: string
    label: string | MessageDescriptor
    icon?: ComponentType
    destructive?: boolean
  }[]
  user?: CurrentUser
  isAdmin?: boolean
  children: ReactNode
}

export function SettingsLayout(props: SettingsLayoutProps) {
  return (
    <SidebarProvider>
      <SettingsContent {...props} />
    </SidebarProvider>
  )
}

function SettingsContent({
  area,
  items,
  user,
  isAdmin = false,
  children,
}: SettingsLayoutProps) {
  const { t: _t } = useUiMessages()

  const { i18n } = useLingui()
  const { setOpenMobile } = useSidebar()
  const { ref, showFooterBorder } = useSidebarScroll()
  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="text-muted-foreground hover:text-foreground"
              >
                <SettingsBackLink onNavigate={() => setOpenMobile(false)} />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent ref={ref}>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav
                aria-label={
                  area === 'Admin'
                    ? _t({ message: 'Admin settings' })
                    : _t({ message: 'Account settings' })
                }
              >
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        className={
                          item.destructive
                            ? 'text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive data-[active=true]:bg-destructive/10 data-[active=true]:text-destructive'
                            : undefined
                        }
                      >
                        <Link
                          to={area === 'Account' ? '/settings' : '/admin'}
                          hash={item.id}
                          replace
                          hashScrollIntoView={{ block: 'start' }}
                          search={(previous) => previous}
                          activeOptions={{ includeHash: true }}
                          onClick={() => setOpenMobile(false)}
                        >
                          {item.icon ? (
                            <item.icon />
                          ) : (
                            <HugeiconsIcon
                              icon={Settings02Icon}
                              aria-hidden="true"
                            />
                          )}
                          <span>
                            {typeof item.label === 'string'
                              ? item.label
                              : i18n._(item.label)}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter
          className={cn(
            'border-t border-transparent',
            showFooterBorder && 'border-sidebar-border',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            {user ? (
              <AccountMenu
                user={user}
                isAdmin={isAdmin}
                align="start"
                side="top"
              />
            ) : (
              <div className="flex size-7 items-center justify-center">
                <Skeleton className="size-6 rounded-full" />
              </div>
            )}
            <AboutDialog />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="mx-auto w-full max-w-[808px] space-y-10 p-4 pb-8 md:p-6 md:pb-10">
          <header className="flex items-center gap-2">
            <SidebarTrigger
              className="md:hidden"
              size="icon"
              aria-label={
                area === 'Admin'
                  ? _t({ message: 'Open admin navigation' })
                  : _t({ message: 'Open account navigation' })
              }
            />
            <h1 className="text-2xl font-medium">
              {i18n._(area === 'Account' ? accountTitle : adminTitle)}
            </h1>
          </header>
          {children}
        </div>
      </SidebarInset>
    </>
  )
}
