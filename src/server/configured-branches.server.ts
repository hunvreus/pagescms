import { NO_CONFIGURED_BRANCHES } from '#/lib/repository-access-errors'
import { createConfigurationStore } from './configuration-store.server'
import type { RequestServices } from './request-services.server'
import type { ProjectUser } from './projects.server'

export class NoConfiguredBranchesError extends Error {
  constructor() {
    super(NO_CONFIGURED_BRANCHES)
    this.name = 'NoConfiguredBranchesError'
  }
}
export async function configuredCollaboratorBranches(
  services: RequestServices,
  user: ProjectUser,
  repository: { owner: string; repo: string },
  requested?: string,
  firstOnly = false,
) {
  const admission = await services.repositoryAccess.resolve(
    user,
    repository.owner,
    repository.repo,
  )
  const coreAllows = (branch: string) =>
    !admission.branches ||
    admission.branches === 'all' ||
    admission.branches.includes(branch)
  const permitted = async (branches: string[]) => {
    const candidates = branches.filter(coreAllows)
    if (!candidates.length) return []
    const decision = await services.access.discover({
      operation: 'branch.read',
      principal: {
        type:
          admission.tokenSource === 'installation' ? 'collaborator' : 'user',
        id: user.id,
        collaboratorKey: admission.collaboratorKey,
      },
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
  const store = createConfigurationStore({ database: services.cacheDatabase })
  const configured = async (branch: string) =>
    Boolean(
      await store.get(admission.api, repository.owner, repository.repo, branch),
    )
  // Ordinary navigation does not load or probe every repository branch.
  if (
    firstOnly &&
    requested &&
    (await permitted([requested])).length &&
    (await admission.api.branchExists(
      repository.owner,
      repository.repo,
      requested,
    )) &&
    (await configured(requested))
  )
    return [requested]
  const metadata = await admission.api.getRepository(
    repository.owner,
    repository.repo,
  )
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
  const result: string[] = []
  for (const branch of await permitted(candidates)) {
    // Invalid configuration is a diagnostic, not an unconfigured branch.
    if (await configured(branch)) {
      result.push(branch)
      if (firstOnly) break
    }
  }
  return result
}
