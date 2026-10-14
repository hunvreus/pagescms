import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import type { GitHubApiFactory } from '#/server/github-api.server'
import type { createRequestServices } from '#/server/request-services.server'

const capture = vi.hoisted(() => ({
  api: undefined as ReturnType<GitHubApiFactory> | undefined,
}))
vi.mock('#/server/database/client.server', () => ({
  createDatabase: vi.fn(() => ({})),
}))
vi.mock('#/server/request-services.server', () => ({
  createRequestServices: (
    _environment: Parameters<typeof createRequestServices>[0],
    _headers: Headers,
    dependencies: Parameters<typeof createRequestServices>[2],
  ) => {
    capture.api = dependencies?.githubApiFactory?.('test-token')
    return {}
  },
  createRequestServicesAccessor: vi.fn(),
}))
afterEach(() => vi.unstubAllEnvs())

it('retains saved fixture content when Vite reloads the request-services module', async () => {
  vi.stubEnv('DATABASE_URL', `file:/tmp/${randomUUID()}/seed.db`)
  const scope = randomUUID()
  const request = new Request('http://localhost/', {
    headers: { 'x-pagescms-e2e-scope': scope },
  })
  const first = await import('./e2e/request-services.server')
  first.createRequestServicesForRequest(request)
  const api = capture.api
  if (!api) throw new Error('Missing fixture API')
  const value = {
    title: 'Changed existing title',
    count: 0,
    enabled: false,
    layout: [
      { _block: 'widget', body: 'Edited existing block' },
      { _block: 'widget', body: 'New block' },
    ],
  }
  const saved = await api.putFile({
    owner: 'pagescms',
    repo: 'fixture',
    branch: 'main',
    path: 'content/groups.json',
    content: Buffer.from(JSON.stringify(value)).toString('base64'),
    message: 'Save fixture',
    sha: 'groups-sha-1',
  })
  // Vite invalidates module-local state on a server-module reload.
  vi.resetModules()
  const reloaded = await import('./e2e/request-services.server')
  reloaded.createRequestServicesForRequest(request)
  const nextApi = capture.api
  if (!nextApi) throw new Error('Missing reloaded fixture API')
  const read = await nextApi.getFile(
    'pagescms',
    'fixture',
    'content/groups.json',
    'main',
  )
  expect(read.sha).toBe(saved.sha)
  expect(
    JSON.parse(Buffer.from(read.content, 'base64').toString('utf8')),
  ).toEqual(value)

  reloaded.createRequestServicesForRequest(
    new Request('http://localhost/', {
      headers: { 'x-pagescms-e2e-scope': randomUUID() },
    }),
  )
  const isolatedApi = capture.api
  if (!isolatedApi) throw new Error('Missing isolated fixture API')
  const isolated = await isolatedApi.getFile(
    'pagescms',
    'fixture',
    'content/groups.json',
    'main',
  )
  expect(isolated.sha).toBe('groups-sha-1')
})

it('reads fixture media at the immutable revision used by the directory cache', async () => {
  vi.stubEnv('DATABASE_URL', `file:/tmp/${randomUUID()}/seed.db`)
  const module = await import('./e2e/request-services.server')
  module.createRequestServicesForRequest(
    new Request('http://localhost/', {
      headers: { 'x-pagescms-e2e-scope': randomUUID() },
    }),
  )
  const api = capture.api
  if (!api) throw new Error('Missing fixture API')
  const revision = await api.getRefSha('pagescms', 'fixture', 'main')
  const files = await api.getMediaDirectory(
    'pagescms',
    'fixture',
    revision,
    'public/images',
  )
  expect(files.map((file) => file.name)).toEqual(
    expect.arrayContaining(['hero.svg', 'cover.svg', 'Library']),
  )
})
