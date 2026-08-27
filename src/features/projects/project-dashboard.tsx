import { useCallback, useState } from 'react'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { AppHeader, AppHeaderSkeleton } from '#/features/account/app-header'

import { ProjectSelector, ProjectSelectorSkeleton } from './project-selector'
import { ProjectTemplates } from './project-templates'
import { RecentProjectList } from './recent-project-list'

import type { ProjectAccount } from '#/server/projects.server'

interface DashboardUser {
  name: string
  email: string
  image: string | null
  githubUsername: string | null
}

export function ProjectDashboard({
  accounts,
  githubAppInstallAvailable,
  isAdmin,
  user,
}: {
  accounts: readonly ProjectAccount[]
  githubAppInstallAvailable: boolean
  isAdmin: boolean
  user: DashboardUser
}) {
  const [selectedAccount, setSelectedAccount] = useState<ProjectAccount | null>(
    accounts[0] ?? null,
  )
  const selectAccount = useCallback(
    (account: ProjectAccount) => setSelectedAccount(account),
    [],
  )

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader isAdmin={isAdmin} user={user} />
      <main className="w-full flex-1 pt-14 lg:pt-16">
        <div className="mx-auto max-w-screen-sm space-y-8 p-4 md:p-6">
          {accounts.length ? (
            <div className="flex min-h-[calc(100vh-12rem)] flex-col justify-center space-y-8">
              <RecentProjectList />
              <section className="space-y-4">
                <h1 className="text-lg font-medium tracking-tight">
                  Open a project
                </h1>
                <ProjectSelector
                  accounts={accounts}
                  onAccountSelect={selectAccount}
                />
              </section>
              {user.githubUsername ? (
                <ProjectTemplates
                  accounts={accounts}
                  defaultAccount={selectedAccount}
                />
              ) : null}
            </div>
          ) : user.githubUsername && githubAppInstallAvailable ? (
            <Empty className="min-h-[calc(100vh-8rem)] border-0">
              <EmptyHeader>
                <EmptyTitle>Install the GitHub App</EmptyTitle>
                <EmptyDescription>
                  Install the GitHub App on at least one account before you can
                  open or create projects.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <a href="/api/github-app/install">Install GitHub App</a>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="min-h-[calc(100vh-8rem)] border-0">
              <EmptyHeader>
                <EmptyTitle>No repositories yet</EmptyTitle>
                <EmptyDescription>
                  Ask a repository owner or organization administrator to invite
                  you.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </main>
    </div>
  )
}

export function ProjectDashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" aria-label="Loading projects">
      <AppHeaderSkeleton />
      <main className="w-full flex-1 pt-14 lg:pt-16">
        <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-screen-sm flex-col justify-center space-y-8 p-4 md:p-6">
          <RecentProjectList />
          <section className="space-y-4">
            <h1 className="text-lg font-medium tracking-tight">
              Open a project
            </h1>
            <ProjectSelectorSkeleton />
          </section>
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-tight">
              Create from a template
            </h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <Skeleton className="aspect-[4/3] rounded-md" key={index} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
