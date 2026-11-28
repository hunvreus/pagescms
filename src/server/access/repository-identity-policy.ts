import { assertAccessBatchSize } from '#/server/access/policy'
import {
  findRepositoryIdentity,
  repositoryPolicyIdentityFromRow,
} from '#/server/access/repository-identity'
import type { Database } from '#/server/db/client'
import type {
  AccessPolicyGateway,
  AccessRequest,
  AccessDiscoveryRequest,
} from '#/server/access/policy'

export function withRepositoryPolicyIdentity(
  access: AccessPolicyGateway,
  database: Database,
  requireIdentity: boolean,
): AccessPolicyGateway {
  async function resolve<T extends AccessRequest | AccessDiscoveryRequest>(
    request: T,
    rows?: Map<
      string,
      Promise<Awaited<ReturnType<typeof findRepositoryIdentity>>>
    >,
  ): Promise<T> {
    if (request.tenant.type !== 'repository' || !request.target?.repository)
      return request
    const address = {
      owner: request.target.repository.owner,
      repo: request.target.repository.repo,
      repoId: request.target.repository.repoId,
    }
    const admitted =
      request.principal.type === 'anonymous'
        ? undefined
        : request.principal.repositoryIdentity
    if (admitted) {
      if (
        address.repoId !== undefined &&
        address.repoId !== admitted.externalId
      )
        throw new Error(
          'The repository identity does not match. Reload before continuing.',
        )
      if (!requireIdentity) return request
      if (!admitted.ownerId)
        throw new Error('Verified repository identity is required')
      return {
        ...request,
        tenant: {
          ...request.tenant,
          id: JSON.stringify([
            admitted.source,
            admitted.externalId,
            admitted.ownerId,
          ]),
        },
        target: {
          ...request.target,
          repository: { ...address, repoId: admitted.externalId },
        },
      }
    }
    // Without an extension policy or a pinned ID, there is no identity to
    // normalize or validate at this boundary. Admission remains separate.
    if (!requireIdentity && address.repoId === undefined) return request
    const key = JSON.stringify([
      address.owner.toLowerCase(),
      address.repo.toLowerCase(),
    ])
    let lookup = rows?.get(key)
    if (!lookup) {
      lookup = findRepositoryIdentity(database, address)
      rows?.set(key, lookup)
    }
    const row = await lookup
    if (requireIdentity && request.principal.type !== 'anonymous')
      throw new Error('Verified repository identity is required')
    if (address.repoId !== undefined && row?.externalId !== address.repoId)
      throw new Error(
        'The repository at this address changed. Reload before continuing.',
      )
    if (!requireIdentity) return request
    const id = repositoryPolicyIdentityFromRow(row, address)
    return {
      ...request,
      tenant: { ...request.tenant, id },
      target: {
        ...request.target,
        repository: {
          ...address,
          repoId: row!.externalId!,
          owner: row!.owner,
          repo: row!.repo,
        },
      },
    }
  }
  return {
    ...access,
    authorize: async (request) => access.authorize(await resolve(request)),
    authorizeMany: async (requests) => {
      assertAccessBatchSize(requests)
      const rows = new Map<
        string,
        Promise<Awaited<ReturnType<typeof findRepositoryIdentity>>>
      >()
      const resolved: AccessRequest[] = []
      for (const request of requests)
        resolved.push(await resolve(request, rows))
      return access.authorizeMany(resolved)
    },
    discover: async (request) => access.discover(await resolve(request)),
    execute: async (request, operation) =>
      access.execute(await resolve(request), operation),
    executeQuota: async (request, key, operation) =>
      access.executeQuota(await resolve(request), key, operation),
    reserveQuota: async (request, key) =>
      access.reserveQuota(await resolve(request), key),
  }
}
