import { sameOriginRequest } from '#/server/csrf'
import { AccessDeniedError } from '#/server/access/policy'
import { repositoryRef, branchName } from '#/lib/repository'
import {
  requireRepositoryManager,
  repositoryAdmissionPrincipal,
  resolveRepositoryPrincipal,
} from '#/server/access/repository-policy'
import type { RequestServices } from '#/server/context'
import type { PluginRoute, PluginRequestContext } from '#/plugins/server'

export async function handlePluginRequest(
  routes: Readonly<Record<string, PluginRoute>> | undefined,
  plugin: string,
  path: string,
  request: Request,
  services: RequestServices,
): Promise<Response> {
  const key = `${request.method} ${plugin}/${path}`
  const route = routes && Object.hasOwn(routes, key) ? routes[key] : undefined
  if (!route) return new Response(null, { status: 404 })
  try {
    let user: PluginRequestContext['user'] = null
    let repository: PluginRequestContext['repository'] = null
    let repositoryIdentity: PluginRequestContext['repositoryIdentity']
    if (route.access !== 'public') {
      if (!['GET', 'HEAD'].includes(request.method)) {
        if (!sameOriginRequest(request, services.configuration.auth.baseUrl))
          return new Response('Invalid request origin', { status: 403 })
      }
      const session = await services.getSession()
      if (!session?.user)
        return new Response('Authentication required', { status: 401 })
      const expectedAccount = request.headers.get('x-pagescms-account')
      if (
        (!['GET', 'HEAD'].includes(request.method) && !expectedAccount) ||
        (expectedAccount && expectedAccount !== session.user.id)
      )
        return new Response('Account changed; reload before continuing', {
          status: 409,
        })
      user = {
        ...session.user,
        githubUsername: session.user.githubUsername ?? null,
      }
      if (route.access === 'repository' || route.access === 'manager') {
        const params = new URL(request.url).searchParams
        try {
          repository = {
            ...repositoryRef({
              owner: params.get('owner') ?? '',
              repo: params.get('repo') ?? '',
              repoId: params.get('repoId') ?? undefined,
            }),
            branch: branchName(params.get('branch') ?? ''),
          }
        } catch {
          return new Response('Invalid repository context', { status: 400 })
        }
        const principal =
          route.access === 'manager'
            ? repositoryAdmissionPrincipal(
                user,
                await requireRepositoryManager(
                  services.repositoryAccess,
                  user,
                  repository,
                ),
              )
            : await resolveRepositoryPrincipal(
                services.repositoryAccess,
                user,
                repository,
              )
        if (
          principal.type === 'anonymous' ||
          !principal.repositoryIdentity?.ownerId
        )
          throw new Error('Verified repository identity is required')
        repositoryIdentity = principal.repositoryIdentity
        repository = {
          ...repository,
          repoId: principal.repositoryIdentity.externalId,
        }
        await services.access.authorize({
          operation:
            route.access === 'manager'
              ? 'repository.manage'
              : 'repository.read',
          principal,
          tenant: {
            type: 'repository',
            id: `${repository.owner}/${repository.repo}`.toLowerCase(),
          },
          target: { repository, branch: repository.branch },
        })
      }
    }
    return await route.handle(request, {
      services,
      user,
      repository,
      repositoryIdentity,
    })
  } catch (error) {
    if (error instanceof AccessDeniedError)
      return new Response('Access denied', { status: 403 })
    throw error
  }
}
