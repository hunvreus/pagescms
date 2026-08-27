import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Laptop, LoaderCircle, Moon, Settings, Sun } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import { AboutDialog } from '#/features/projects/about-dialog'

type Theme = 'light' | 'dark' | 'system'

export interface AppHeaderUser {
  name: string
  email: string
  image: string | null
  githubUsername: string | null
}

export function AppHeader({
  isAdmin,
  user,
}: {
  isAdmin: boolean
  user: AppHeaderUser
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-background">
      <div className="flex items-center gap-2 px-2 py-2 lg:px-4 lg:py-3">
        <AboutDialog />
        <div className="ml-auto flex items-center gap-2">
          {isAdmin ? (
            <Button asChild size="sm" variant="ghost">
              <Link to="/admin">
                <Settings />
                Admin
              </Link>
            </Button>
          ) : null}
          <AccountMenu user={user} />
        </div>
      </div>
    </header>
  )
}

export function AccountMenu({ user }: { user: AppHeaderUser }) {
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const [theme, setTheme] = useState<Theme>('system')
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const avatar =
    user.image ??
    (user.githubUsername
      ? `https://github.com/${encodeURIComponent(user.githubUsername)}.png?size=48`
      : `https://unavatar.io/${encodeURIComponent(user.email)}?fallback=false`)

  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setTheme(stored)
    }
  }, [])

  function updateTheme(value: string) {
    if (value !== 'light' && value !== 'dark' && value !== 'system') return
    setTheme(value)
    window.localStorage.setItem('theme', value)
    const dark =
      value === 'dark' ||
      (value === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }

  async function signOut() {
    setSigningOut(true)
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    queryClient.clear()
    window.location.assign('/sign-in')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="User menu"
          className="rounded-full"
          size="icon-sm"
          variant="ghost"
        >
          <Avatar size="sm">
            <AvatarImage alt={user.name || user.email} src={avatar} />
            <AvatarFallback>{initials(user.name || user.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>
          <div className="truncate text-sm text-foreground">
            {user.name || user.githubUsername || user.email}
          </div>
          <div className="truncate font-normal">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub open={themeMenuOpen} onOpenChange={setThemeMenuOpen}>
          <DropdownMenuSubTrigger>
            Theme: {theme[0].toUpperCase() + theme.slice(1)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme}>
              <ThemeItem
                icon={<Sun />}
                label="Light"
                setTheme={updateTheme}
                setOpen={setThemeMenuOpen}
                value="light"
              />
              <ThemeItem
                icon={<Moon />}
                label="Dark"
                setTheme={updateTheme}
                setOpen={setThemeMenuOpen}
                value="dark"
              />
              <ThemeItem
                icon={<Laptop />}
                label="System"
                setTheme={updateTheme}
                setOpen={setThemeMenuOpen}
                value="system"
              />
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <Link to="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          variant="destructive"
          onSelect={() => void signOut()}
        >
          {signingOut ? <LoaderCircle className="animate-spin" /> : null}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeItem({
  icon,
  label,
  setOpen,
  setTheme,
  value,
}: {
  icon: ReactNode
  label: string
  setOpen: (open: boolean) => void
  setTheme: (value: string) => void
  value: Theme
}) {
  return (
    <DropdownMenuRadioItem
      value={value}
      onSelect={(event) => {
        event.preventDefault()
        setTheme(value)
        setOpen(false)
      }}
    >
      {icon}
      {label}
    </DropdownMenuRadioItem>
  )
}

export function AppHeaderSkeleton() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-background">
      <div className="flex items-center gap-2 px-2 py-2 lg:px-4 lg:py-3">
        <AboutDialog />
        <div className="ml-auto flex size-7 items-center justify-center">
          <Skeleton className="size-6 rounded-full" />
        </div>
      </div>
    </header>
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
