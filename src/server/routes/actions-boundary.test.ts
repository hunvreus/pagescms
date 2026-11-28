import { afterEach, expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import type { RequestServices } from '#/server/context'
import type * as actions from '#/server/services/actions'

const calls = vi.hoisted(() => ({
  readActions: vi.fn(),
  runRepositoryAction: vi.fn(),
  manageActionRun: vi.fn(),
}))
vi.mock('#/server/services/actions', async (original) => ({
  ...(await original<typeof actions>()),
  ...calls,
}))
afterEach(() => vi.resetAllMocks())

const coordinates = { owner: 'owner', repo: 'site', branch: 'main' }
const services = {
  getSession: async () => ({
    user: {
      id: 'user',
      name: 'User',
      email: 'u@example.test',
      emailVerified: true,
    },
  }),
} as unknown as RequestServices
const request = (path: string, data: unknown, origin = 'https://cms.test') =>
  api.request(
    `https://cms.test${path === 'statuses' ? '/api/actions/statuses' : '/api/action-runs'}`,
    {
      method: path === 'manage' ? 'PATCH' : 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-pagescms-account': 'user',
      },
      body: JSON.stringify(data),
    },
    { publicBaseUrl: 'https://cms.test', getServices: () => services },
  )

it('routes action requests through validated operations', async () => {
  calls.runRepositoryAction.mockResolvedValue({ ok: true })
  calls.manageActionRun.mockResolvedValue({ ok: true })
  calls.readActions.mockResolvedValue({ runs: [{ id: 1 }] })
  expect(
    (await request('run', { ...coordinates, actionName: 'build', inputs: {} }))
      .status,
  ).toBe(200)
  expect(
    (await request('manage', { ...coordinates, runId: 1, intent: 'cancel' }))
      .status,
  ).toBe(200)
  const statuses = await request('statuses', [
    { ...coordinates, runIds: [1, 1] },
  ])
  expect(await statuses.json()).toEqual([
    { ...coordinates, runIds: [1], runs: [{ id: 1 }] },
  ])
  expect(calls.runRepositoryAction).toHaveBeenCalledOnce()
  expect(calls.manageActionRun).toHaveBeenCalledOnce()
  expect(calls.readActions).toHaveBeenCalledOnce()
})

it('rejects invalid and cross-origin action requests', async () => {
  expect(
    (await request('manage', { ...coordinates, runId: -1, intent: 'cancel' }))
      .status,
  ).toBe(400)
  expect((await request('statuses', [])).status).toBe(400)
  expect(
    (
      await request(
        'run',
        { ...coordinates, actionName: 'build', inputs: {} },
        'https://other.test',
      )
    ).status,
  ).toBe(403)
  expect(calls.runRepositoryAction).not.toHaveBeenCalled()
  expect(calls.manageActionRun).not.toHaveBeenCalled()
})
