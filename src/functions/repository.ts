import { createServerFn } from '@tanstack/react-start'

import { branchName, repositoryRef } from '#/lib/repository'

import type { RequestServices } from '#/server/request-services.server'

function parseRepositoryRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid repository request')
  }
  const value = input as Record<string, unknown>
  if (typeof value.owner !== 'string' || typeof value.repo !== 'string') {
    throw new Error('Invalid repository request')
  }
  const repository = repositoryRef({ owner: value.owner, repo: value.repo })
  const branch =
    typeof value.branch === 'string' && value.branch ? value.branch : undefined
  const hasControlCharacter = branch
    ? Array.from(branch).some((character) => {
        const code = character.codePointAt(0)
        return code !== undefined && (code <= 31 || code === 127)
      })
    : false
  if (branch && (branch.length > 255 || hasControlCharacter)) {
    throw new Error('Invalid branch name')
  }
  return { ...repository, branch }
}

export function parseBranchCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid branch creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    typeof value.source !== 'string'
  ) {
    throw new Error('Invalid branch creation')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: branchName(value.branch),
    source: branchName(value.source),
  }
}

function authenticatedProjectUser(
  session: Awaited<ReturnType<RequestServices['getSession']>>,
) {
  if (!session?.user) throw new Error('Authentication required')
  return {
    id: session.user.id,
    email: session.user.email,
    githubUsername: session.user.githubUsername ?? null,
  }
}

export const getRepositoryWorkspace = createServerFn({ method: 'GET' })
  .validator(parseRepositoryRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = authenticatedProjectUser(await services.getSession())
    return services.access.execute(
      {
        operation: data.branch ? 'configuration.read' : 'repository.read',
        principal: { type: 'user', id: user.id },
        tenant: {
          type: 'repository',
          id: `${data.owner.toLowerCase()}/${data.repo.toLowerCase()}`,
        },
        target: {
          repository: { owner: data.owner, repo: data.repo },
          ...(data.branch ? { branch: data.branch } : {}),
        },
      },
      () =>
        services.projects.openRepository(
          user,
          data.owner,
          data.repo,
          data.branch,
        ),
    )
  })

export const createRepositoryBranch = createServerFn({ method: 'POST' })
  .validator(parseBranchCreate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const user = authenticatedProjectUser(await services.getSession())
    return services.access.execute(
      {
        operation: 'branch.create',
        principal: { type: 'user', id: user.id },
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.source,
        },
      },
      async () => {
        const { api } = await services.repositoryAccess.resolve(
          user,
          data.owner,
          data.repo,
          data.source,
        )
        return api.createBranch(data.owner, data.repo, data.branch, data.source)
      },
    )
  })
