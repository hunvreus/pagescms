import { readApi } from '#/client/api/index'
import type { RepositoryAccount } from '#/server/repository/repositories'
import type { listAccountRepositories } from '#/server/services/dashboard'

export async function searchRepositoryRepositories(data: {
  account: RepositoryAccount
  keyword: string
}): ReturnType<typeof listAccountRepositories> {
  const params = new URLSearchParams({
    login: data.account.login,
    type: data.account.type,
    repositorySelection: data.account.repositorySelection,
    installationId: String(data.account.installationId),
    keyword: data.keyword,
  })
  return readApi(`/api/repositories?${params}`)
}
