import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'

import { Avatar, AvatarImage } from '#/components/ui/avatar'
import { GradientAvatarFallback } from '#/components/gradient-avatar-fallback'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import type { CurrentUser } from '#/lib/authentication'

export function AccountMenu({
  user,
  isAdmin,
  align = 'end',
  side = 'bottom',
}: {
  user: CurrentUser
  isAdmin: boolean
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
}) {
  const { t } = useUiMessages()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  async function signOut() {
    setSigningOut(true)
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{}',
      })
      if (!response.ok) throw new Error('Could not sign out. Try again.')
      await queryClient.cancelQueries()
      queryClient.clear()
      window.location.assign('/sign-in')
    } catch (error) {
      const { notifyError } = await import('#/lib/notifications')
      notifyError(error, t`Could not sign out. Try again.`, {
        account: user.id,
      })
      setSigningOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t`User menu`}
          className="rounded-full"
          size="icon-sm"
          variant="ghost"
        >
          <Avatar size="sm">
            <AvatarImage
              alt={user.name || user.email}
              src={user.image ?? undefined}
            />
            <GradientAvatarFallback
              identity={user.email}
              initials={initials(user.name || user.email)}
            />
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-48">
        <DropdownMenuLabel className="min-w-0">
          <div className="truncate text-sm text-foreground">
            {user.name || user.githubUsername || user.email}
          </div>
          <div className="truncate font-normal">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <UiTrans>Admin</UiTrans>
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <UiTrans>Account</UiTrans>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="https://pagescms.org/help/"
            target="_blank"
            rel="noreferrer noopener"
          >
            <UiTrans>Help</UiTrans>
            <HugeiconsIcon
              aria-hidden="true"
              icon={ArrowUpRight}
              className="ml-auto opacity-50"
            />
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          aria-busy={signingOut}
          disabled={signingOut}
          variant="destructive"
          onSelect={() => void signOut()}
        >
          <UiTrans>Sign out</UiTrans>
          {signingOut ? <Spinner aria-hidden="true" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function initials(value: string) {
  return value
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
