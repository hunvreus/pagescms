import { createServerFn } from '@tanstack/react-start'

import type { ProjectAccount } from '#/server/projects.server'
import type { RequestServices } from '#/server/request-services.server'

function requireUser(
  session: Awaited<ReturnType<RequestServices['getSession']>>,
) {
  if (!session?.user) throw new Error('Authentication required')
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    githubUsername: session.user.githubUsername ?? null,
  }
}

export function parseRepositorySearch(input: unknown): {
  account: ProjectAccount
  keyword: string
} {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid repository search')
  }
  const value = input as Record<string, unknown>
  const account = value.account
  if (typeof account !== 'object' || account === null) {
    throw new Error('Invalid project account')
  }
  const candidate = account as Record<string, unknown>
  if (
    typeof candidate.login !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(candidate.login) ||
    (candidate.type !== 'user' && candidate.type !== 'org') ||
    (candidate.repositorySelection !== 'all' &&
      candidate.repositorySelection !== 'selected') ||
    typeof candidate.installationId !== 'number' ||
    !Number.isInteger(candidate.installationId) ||
    candidate.installationId <= 0
  ) {
    throw new Error('Invalid project account')
  }
  const keyword = typeof value.keyword === 'string' ? value.keyword.trim() : ''
  if (keyword.length > 100) throw new Error('Repository search is too long')

  return {
    account: {
      login: candidate.login,
      type: candidate.type,
      repositorySelection: candidate.repositorySelection,
      installationId: candidate.installationId,
    },
    keyword,
  }
}

export const getDashboardData = createServerFn({ method: 'GET' }).handler(
  async ({ context }) => {
    const services = context.getServices()
    const session = await services.getSession()
    const user = requireUser(session)
    const accounts = await services.access.execute(
      {
        operation: 'repository.list',
        principal: { type: 'user', id: user.id },
        tenant: { type: 'deployment', id: services.configuration.auth.baseUrl },
        facts: { hasGithubIdentity: Boolean(user.githubUsername) },
      },
      () => services.projects.listAccounts(user),
    )

    return {
      user,
      accounts,
    }
  },
)

export const getProjectRepositories = createServerFn({ method: 'GET' })
  .validator(parseRepositorySearch)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = requireUser(await services.getSession())

    return services.access.execute(
      {
        operation: 'repository.list',
        principal: { type: 'user', id: user.id },
        tenant: {
          type: 'installation',
          id: String(data.account.installationId),
        },
        facts: {
          account: data.account.login,
          keyword: data.keyword,
        },
      },
      () =>
        services.projects.listRepositories(user, data.account, data.keyword),
    )
  })
