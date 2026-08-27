import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import {
  ProjectDashboard,
  ProjectDashboardSkeleton,
} from '#/features/projects/project-dashboard'
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
  pendingComponent: ProjectDashboardSkeleton,
  component: Dashboard,
})

function Dashboard() {
  const { user, accounts, isAdmin, githubAppInstallAvailable } =
    useSuspenseQuery(dashboardQueryOptions()).data

  return (
    <ProjectDashboard
      accounts={accounts}
      githubAppInstallAvailable={githubAppInstallAvailable}
      isAdmin={isAdmin}
      user={user}
    />
  )
}
