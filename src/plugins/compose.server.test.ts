import { describe, expect, it, vi } from 'vitest'
import { createAccessPolicyGateway } from '#/server/access/policy'
import {
  composePolicies,
  composeServerPlugins,
  matchPluginHandler,
} from './compose.server'
import type {
  AccessPolicy,
  AccessRequest,
  AccessDiscoveryResource,
} from '#/server/access/policy'

const request: AccessRequest = {
  operation: 'entry.read',
  principal: { type: 'user', id: 'u' },
  tenant: { type: 'repository', id: 'repo' },
}
const resources: AccessDiscoveryResource[] = [
  { type: 'collection', name: 'posts' },
  { type: 'collection', name: 'pages' },
]
function policy(name: string, allowed: boolean): AccessPolicy {
  return {
    authorize: async () =>
      allowed
        ? { allowed: true }
        : { allowed: false, reason: 'permission_denied' },
    discover: async () => ({
      visibility: 'filtered',
      resources: resources.filter((r) => r.name === name),
    }),
  }
}
describe('narrowing plugin policies', () => {
  it('never allows a request denied by another policy, in either order', async () => {
    for (const policies of [
      [policy('posts', true), policy('posts', false)],
      [policy('posts', false), policy('posts', true)],
    ]) {
      await expect(
        composePolicies(policies)!.authorize(request),
      ).resolves.toMatchObject({ allowed: false })
    }
  })
  it('intersects discovery results and never introduces unrequested resources', async () => {
    const composed = composePolicies([
      policy('posts', true),
      policy('pages', true),
    ])!
    await expect(
      composed.discover!({ ...request, resources }),
    ).resolves.toEqual({ visibility: 'filtered', resources: [] })
    const extra: AccessPolicy = {
      authorize: async () => ({ allowed: true }),
      discover: async () => ({
        visibility: 'filtered',
        resources: [{ type: 'collection', name: 'secret' }],
      }),
    }
    await expect(
      composePolicies([extra])!.discover!({ ...request, resources }),
    ).resolves.toEqual({ visibility: 'filtered', resources: [] })
  })
  it.each(['reserve', 'settle', 'both'] as const)(
    'rejects unsupported %s accounting hooks at the plugin boundary',
    (hook) => {
      const reserve = vi.fn(async () => ({
        allowed: true as const,
        grant: { reservation: { id: 'r' } },
      }))
      const settle = vi.fn(async () => {})
      expect(() =>
        composeServerPlugins(
          [
            {
              id: 'accounting',
              create: () => ({
                policies: [
                  {
                    authorize: async () => ({ allowed: true }),
                    discover: async () => ({ visibility: 'all' }),
                    ...(hook !== 'settle' ? { reserve } : {}),
                    ...(hook !== 'reserve' ? { settle } : {}),
                  },
                ],
              }),
            },
          ],
          {},
        ),
      ).toThrow('cannot perform resource accounting')
      expect(reserve).not.toHaveBeenCalled()
      expect(settle).not.toHaveBeenCalled()
    },
  )

  it('rejects incomplete policy contributions', () => {
    expect(() =>
      composeServerPlugins(
        [
          {
            id: 'broken',
            create: () => ({
              policies: [{ authorize: async () => ({ allowed: true }) }],
            }),
          },
        ],
        {},
      ),
    ).toThrow('authorization and discovery')
  })
  it('passes explicit delegation to the operation only when every policy permits it', async () => {
    const delegate: AccessPolicy = {
      authorize: async () => ({
        allowed: true,
        grant: { delegatedOperations: ['action.run'] },
      }),
      discover: async () => ({ visibility: 'all' }),
    }
    const gateway = createAccessPolicyGateway({
      policy: composePolicies([delegate, policy('posts', true)]),
    })
    await expect(
      gateway.execute(request, async (grant) => grant?.delegatedOperations),
    ).resolves.toEqual(['action.run'])
    for (const policies of [
      [delegate, policy('posts', false)],
      [policy('posts', false), delegate],
    ]) {
      const blocked = createAccessPolicyGateway({
        policy: composePolicies(policies),
      })
      await expect(
        blocked.execute(request, async () => {
          throw new Error('Operation must not run')
        }),
      ).rejects.toThrow('Access denied')
    }
    await expect(
      createAccessPolicyGateway({}).authorize(request),
    ).resolves.not.toHaveProperty('delegatedOperations')
  })
})

describe('mounted plugin handlers', () => {
  const handle = async () => new Response('ok')
  const compose = (...handlers: { path: string; methods?: string[] }[][]) =>
    composeServerPlugins(
      handlers.map((list, index) => ({
        id: `p${index}`,
        create: () => ({
          handlers: list.map((handler) => ({
            methods: ['GET'],
            handle,
            ...handler,
          })) as never,
        }),
      })),
      {},
    )

  it('matches exact paths and segment-bounded prefixes', () => {
    const services = compose([
      { path: '/mcp' },
      { path: '/api/v1/*' },
      { path: '/.well-known/oauth-protected-resource/*' },
    ])
    const find = (path: string) =>
      matchPluginHandler(services.pluginHandlers, path)?.path
    expect(find('/mcp')).toBe('/mcp')
    expect(find('/mcp/extra')).toBeUndefined()
    expect(find('/api/v1')).toBe('/api/v1/*')
    expect(find('/api/v1/repositories')).toBe('/api/v1/*')
    expect(find('/api/v10')).toBeUndefined()
    expect(find('/.well-known/oauth-protected-resource/mcp')).toBe(
      '/.well-known/oauth-protected-resource/*',
    )
  })

  it.each([
    '/github',
    '/github/*',
    '/teams',
    '/teams/*',
    '/settings',
    '/admin',
    '/sign-in',
    '/onboarding',
    '/invite',
    '/api/auth/*',
    '/api/plugins/x',
    '/api',
    '/_serverFn/x',
    '/owner/*',
    '/github/owner/repo',
    '/api/../x',
    'relative',
  ])('rejects reserved or shadowing path %s', (path) => {
    expect(() => compose([{ path }])).toThrow()
  })

  it('rejects overlapping handlers across plugins and invalid methods', () => {
    expect(() =>
      compose([{ path: '/api/v1/*' }], [{ path: '/api/v1/x' }]),
    ).toThrow('Conflicting plugin handler path')
    expect(() => compose([{ path: '/mcp', methods: ['TRACE'] }])).toThrow(
      'Invalid handler',
    )
  })
})

describe('auth extensions', () => {
  it('collects plugins and tables in order and protects core models', () => {
    const table = { name: 'oauthClient' }
    const services = composeServerPlugins(
      [
        {
          id: 'a',
          create: () => ({
            auth: {
              plugins: [{ id: 'first' }],
              schema: { oauthClient: table },
            },
          }),
        },
        { id: 'b', create: () => ({ auth: { plugins: [{ id: 'second' }] } }) },
      ],
      {},
    )
    expect(services.authExtension.plugins.map((plugin) => plugin.id)).toEqual([
      'first',
      'second',
    ])
    expect(services.authExtension.schema.oauthClient).toBe(table)
    expect(() =>
      composeServerPlugins(
        [{ id: 'a', create: () => ({ auth: { schema: { user: {} } } }) }],
        {},
      ),
    ).toThrow('Conflicting auth model: user')
    expect(() =>
      composeServerPlugins(
        [
          { id: 'a', create: () => ({ auth: { plugins: [{ id: 'x' }] } }) },
          { id: 'b', create: () => ({ auth: { plugins: [{ id: 'x' }] } }) },
        ],
        {},
      ),
    ).toThrow('Duplicate auth plugin: x')
  })
})

it('composes batch policies per request without sharing delegated grants or dropping denials', async () => {
  const requests = [request, request, request]
  const first: AccessPolicy = {
    authorize: async () => ({ allowed: true }),
    authorizeMany: async () => [
      { allowed: true, grant: { delegatedOperations: ['action.run'] } },
      { allowed: true },
      { allowed: false, reason: 'feature_unavailable' },
    ],
  }
  const second: AccessPolicy = {
    authorize: async () => ({ allowed: true }),
    authorizeMany: async () => [
      { allowed: true },
      { allowed: true, grant: { delegatedOperations: ['action.cancel'] } },
      { allowed: true },
    ],
  }
  const decisions = await composePolicies([first, second])!.authorizeMany!(
    requests,
  )
  expect(decisions).toEqual([
    { allowed: true, grant: { delegatedOperations: ['action.run'] } },
    { allowed: true, grant: { delegatedOperations: ['action.cancel'] } },
    { allowed: false, reason: 'feature_unavailable' },
  ])
  await expect(
    createAccessPolicyGateway({
      policy: composePolicies([first, second]),
    }).authorizeMany(requests),
  ).rejects.toMatchObject({ reason: 'feature_unavailable' })
})
it('retains individual policy restrictions when only some policies support batching', async () => {
  const fast = vi.fn(async () => [{ allowed: true as const }])
  const broad: AccessPolicy = {
    authorize: async () => ({ allowed: true }),
    authorizeMany: fast,
  }
  const narrow: AccessPolicy = {
    authorize: async () => ({ allowed: false, reason: 'permission_denied' }),
  }
  const composed = composePolicies([broad, narrow])!
  expect(composed.authorizeMany).toBeUndefined()
  await expect(
    createAccessPolicyGateway({ policy: composed }).authorizeMany([request]),
  ).rejects.toMatchObject({ reason: 'permission_denied' })
  expect(fast).not.toHaveBeenCalled()
})

it('combines denied content operations for single and batched reads', async () => {
  const narrow = (operation: AccessRequest['operation']): AccessPolicy => {
    const decision = {
      allowed: true as const,
      grant: { deniedOperations: [operation] },
    }
    return {
      authorize: async () => decision,
      authorizeMany: async (requests) => requests.map(() => decision),
    }
  }
  const composed = composePolicies([
    narrow('entry.rename'),
    narrow('entry.delete'),
  ])!
  const expected = {
    allowed: true,
    grant: { deniedOperations: ['entry.rename', 'entry.delete'] },
  }
  expect(await composed.authorize(request)).toMatchObject(expected)
  expect(await composed.authorizeMany!([request])).toMatchObject([expected])
})
