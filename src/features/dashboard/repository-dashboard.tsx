import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useEffect, useState } from 'react'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { AppHeader, AppHeaderSkeleton } from '#/features/account/app-header'

import {
  initialRepositoryAccount,
  RepositorySelector,
} from './repository-selector'
import { RepositoryTemplates } from './repository-templates'
import {
  RepositoryDashboardContentSkeleton,
  RepositoryDashboardFrame,
} from './repository-loading'
import { RecentRepositoryList } from './recent-repository-list'
import { readRecentRepositories } from './recent-repositories'

import type { RepositoryAccount } from '#/server/repository/repositories'
import type { CurrentUser } from '#/lib/authentication'

type RepositoryDashboardData = {
  accounts: readonly RepositoryAccount[]
  githubAppInstallAvailable: boolean
  githubConnected: boolean
  isAdmin: boolean
  user: CurrentUser
}

export function RepositoryDashboard(
  props: RepositoryDashboardData | { pendingUserId: string },
) {
  const { t: _t } = useUiMessages()
  const pending = 'pendingUserId' in props
  const userId = pending ? props.pendingUserId : props.user.id
  return (
    <RepositoryDashboardFrame
      header={
        pending ? (
          <AppHeaderSkeleton />
        ) : (
          <AppHeader isAdmin={props.isAdmin} user={props.user} />
        )
      }
      history={<RecentRepositoryList key={userId} account={userId} />}
      label={pending ? _t({ message: 'Loading projects' }) : undefined}
    >
      {pending ? (
        <RepositoryDashboardContentSkeleton />
      ) : (
        <RepositoryDashboardContent {...props} />
      )}
    </RepositoryDashboardFrame>
  )
}

function RepositoryDashboardContent({
  accounts,
  githubAppInstallAvailable,
  githubConnected,
  user,
}: RepositoryDashboardData) {
  const { t: _t } = useUiMessages()

  const [selectedAccount, setSelectedAccount] =
    useState<RepositoryAccount | null>(null)

  useEffect(() => {
    let recentOwner: string | undefined
    try {
      recentOwner = readRecentRepositories(user.id)[0]?.owner
    } catch {
      // History is optional when browser storage is unavailable.
    }
    setSelectedAccount(
      (current) =>
        accounts.find(
          (account) =>
            current !== null &&
            account.login.toLowerCase() === current.login.toLowerCase() &&
            account.installationId === current.installationId,
        ) ??
        initialRepositoryAccount(accounts, user.githubUsername, recentOwner),
    )
  }, [accounts, user.githubUsername, user.id])

  return (
    <>
      {accounts.length ? (
        <div className="space-y-8">
          <section className="space-y-4">
            <h1 className="text-lg font-medium tracking-tight">
              <UiTrans>Open a project</UiTrans>
            </h1>
            <RepositorySelector
              accounts={accounts}
              selectedAccount={selectedAccount}
              onAccountSelect={setSelectedAccount}
              canManageRepositories={Boolean(
                githubConnected && githubAppInstallAvailable,
              )}
              email={user.email}
              githubConnected={githubConnected}
            />
          </section>
          {githubConnected ? (
            <RepositoryTemplates
              accounts={accounts}
              defaultAccount={selectedAccount}
            />
          ) : null}
        </div>
      ) : githubConnected ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>
              {githubAppInstallAvailable
                ? _t({ message: 'Install the GitHub App' })
                : _t({ message: 'GitHub App unavailable' })}
            </EmptyTitle>
            <EmptyDescription>
              {githubAppInstallAvailable
                ? _t({
                    message:
                      'Install the GitHub App on your personal account or an organization, then choose which repositories it can access.',
                  })
                : _t({
                    message:
                      'Ask your administrator to configure the GitHub App.',
                  })}
            </EmptyDescription>
          </EmptyHeader>
          {githubAppInstallAvailable ? (
            <EmptyContent>
              <Button asChild size="sm">
                <a href="/api/github-app/install">
                  <UiTrans>Install GitHub App</UiTrans>
                </a>
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>
              <UiTrans>No projects yet</UiTrans>
            </EmptyTitle>
            <EmptyDescription>
              <UiTrans>Ask a project owner to invite</UiTrans>{' '}
              <span className="font-medium text-foreground break-all">
                {user.email}
              </span>{' '}
              <UiTrans>
                to a repository. Projects will appear here once you have access.
              </UiTrans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  )
}
