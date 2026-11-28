import { isDeploymentAdmin } from '#/server/admin/access'
import type { RequestServices } from '#/server/context'
import type { ServiceUser } from '#/server/services/context'
import type { parseRepositorySearch } from '#/shared/repository-search'
import type { parseTemplateCopy } from '#/shared/requests/repository-template'

export async function dashboardData(
  services: RequestServices,
  user: ServiceUser,
) {
  const { accounts, githubAccountId } = await services.access.execute(
    {
      operation: 'repository.list',
      principal: { type: 'user', id: user.id },
      tenant: { type: 'deployment', id: services.configuration.auth.baseUrl },
      facts: { hasGithubIdentity: Boolean(user.githubUsername) },
    },
    () => services.repositories.getAccountAccess(user),
  )
  return {
    user: { ...user, image: user.image ?? null },
    accounts,
    githubConnected: githubAccountId !== null,
    isAdmin: isDeploymentAdmin(user, services.configuration.adminEmails),
    githubAppInstallAvailable: Boolean(services.configuration.githubAppName),
  }
}

export async function listAccountRepositories(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseRepositorySearch>,
) {
  return services.access.execute(
    {
      operation: 'repository.list',
      principal: { type: 'user', id: user.id },
      tenant: { type: 'installation', id: String(data.account.installationId) },
      facts: { account: data.account.login, keyword: data.keyword },
    },
    () =>
      services.repositories.listRepositories(user, data.account, data.keyword),
  )
}

export async function copyTemplate(
  services: RequestServices,
  user: ServiceUser,
  data: ReturnType<typeof parseTemplateCopy>,
) {
  return services.access.executeQuota(
    {
      operation: 'repository.create',
      principal: { type: 'user', id: user.id },
      tenant: {
        type: 'installation',
        id: String(data.account.installationId),
      },
      facts: {
        account: data.account.login,
        template: `${data.templateOwner}/${data.templateRepo}`,
      },
    },
    crypto.randomUUID(),
    () =>
      services.repositories.createFromTemplate(user, {
        installationId: data.account.installationId,
        owner: data.account.login,
        repo: data.name,
        templateOwner: data.templateOwner,
        templateRepo: data.templateRepo,
      }),
  )
}
