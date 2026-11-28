import { repositoryAdmissionPrincipal } from '#/server/access/repository-policy'
import type { RequestServices } from '#/server/context'
import type { RepositoryUser } from '../repository/repositories'

export async function collaboratorBranches(
  services: Pick<RequestServices, 'repositoryAccess' | 'access'>,
  user: RepositoryUser,
  repository: { owner: string; repo: string; repoId?: string },
  requested?: string,
  firstOnly = false,
) {
  const admission = await services.repositoryAccess.resolve(
    user,
    repository.owner,
    repository.repo,
    undefined,
    repository.repoId,
  )
  const permitted = async (candidates: string[]) => {
    if (!candidates.length) return []
    const decision = await services.access.discover({
      operation: 'branch.read',
      principal: repositoryAdmissionPrincipal(user, admission),
      tenant: {
        type: 'repository',
        id: `${repository.owner}/${repository.repo}`.toLowerCase(),
      },
      target: { repository },
      resources: candidates.map((name) => ({ type: 'branch' as const, name })),
    })
    return decision.visibility === 'all'
      ? candidates
      : decision.visibility === 'none'
        ? []
        : candidates.filter((branch) =>
            decision.resources.some(
              (resource) =>
                resource.type === 'branch' && resource.name === branch,
            ),
          )
  }
  if (
    firstOnly &&
    requested &&
    (await permitted([requested])).length &&
    (requested === admission.repository?.defaultBranch ||
      (await admission.api.branchExists(
        repository.owner,
        repository.repo,
        requested,
      )))
  )
    return [requested]
  const metadata =
    admission.repository ??
    (await admission.api.getRepository(repository.owner, repository.repo))
  const branches = await admission.api.listBranches(
    repository.owner,
    repository.repo,
  )
  const candidates = [
    ...new Set([
      ...(requested ? [requested] : []),
      metadata.defaultBranch,
      ...branches.slice().sort(),
    ]),
  ].filter(
    (branch): branch is string => Boolean(branch) && branches.includes(branch),
  )
  const allowed = await permitted(candidates)
  return firstOnly ? allowed.slice(0, 1) : allowed
}
