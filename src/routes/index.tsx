import { useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { LoaderCircle, LogOut, Settings } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { ProjectSelector } from '#/components/project-selector'
import { getDashboardData } from '#/functions/projects'

export const Route = createFileRoute('/')({
  loader: async () => {
    try {
      return await getDashboardData()
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({ href: '/sign-in' })
      }
      throw error
    }
  },
  staleTime: 10_000,
  pendingMs: 120,
  pendingComponent: DashboardSkeleton,
  component: Dashboard,
})

function Dashboard() {
  const { user, accounts } = Route.useLoaderData()

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader user={user} />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-2xl items-center px-5 py-12">
        <section className="w-full space-y-8">
          <header className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Welcome back, {user.name}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Open a project
            </h1>
          </header>

          <ProjectSelector accounts={accounts} />
        </section>
      </main>
    </div>
  )
}

function AppHeader({ user }: { user: ReturnType<typeof Route.useLoaderData> }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    await router.invalidate()
    window.location.assign('/sign-in')
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-5">
        <Link
          className="flex items-center gap-2 font-semibold tracking-tight"
          to="/"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
            P
          </span>
          Pages CMS
        </Link>
        <div className="flex items-center gap-1">
          <span className="hidden max-w-48 truncate px-2 text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
          <Button aria-label="Settings" disabled variant="ghost" size="icon">
            <Settings />
          </Button>
          <Button
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            variant="ghost"
          >
            {signingOut ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <LogOut />
            )}
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-muted/20" aria-label="Loading projects">
      <div className="h-14 border-b bg-background" />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-2xl items-center px-5 py-12">
        <div className="w-full animate-pulse space-y-8">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-8 w-48 rounded bg-muted" />
          </div>
          <div className="h-56 rounded-xl border bg-card" />
        </div>
      </main>
    </div>
  )
}
