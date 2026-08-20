import { useState } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { LoaderCircle, LogOut, Settings, Shield } from 'lucide-react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { Button } from '#/components/ui/button'
import { ProjectSelector } from '#/components/project-selector'
import { dashboardQueryOptions } from '#/queries/session'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(dashboardQueryOptions())
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
  pendingMs: 120,
  pendingComponent: DashboardSkeleton,
  component: Dashboard,
})

function Dashboard() {
  const { user, accounts, isAdmin, githubAppInstallAvailable } =
    useSuspenseQuery(dashboardQueryOptions()).data

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader isAdmin={isAdmin} user={user} />
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

          <ProjectSelector
            accounts={accounts}
            githubAppInstallAvailable={githubAppInstallAvailable}
          />
        </section>
      </main>
    </div>
  )
}

function AppHeader({
  user,
  isAdmin,
}: {
  user: { email: string }
  isAdmin: boolean
}) {
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
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
          <Button asChild aria-label="Settings" variant="ghost" size="icon">
            <Link to="/settings">
              <Settings />
            </Link>
          </Button>
          {isAdmin ? (
            <Button asChild aria-label="Admin" variant="ghost" size="icon">
              <Link to="/admin">
                <Shield />
              </Link>
            </Button>
          ) : null}
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
