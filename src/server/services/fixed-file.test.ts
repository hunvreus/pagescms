import { createClient } from '@libsql/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAccessPolicyGateway } from '#/server/access/policy'
import { createLibSqlDatabase } from '#/server/db/client'
import { createGitHubApi, GitHubApiError } from '#/server/github/api'
import { createRequestServices } from '#/server/context'
import { saveFixedFile } from '#/server/services/content'

const mocks = vi.hoisted(() => ({
  configuration: vi.fn(),
  saveRaw: vi.fn(),
  saveStructured: vi.fn(),
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({ get: mocks.configuration }),
}))
vi.mock('#/server/content/entry-editor', () => ({
  saveRawEntry: mocks.saveRaw,
  saveStructuredEntry: mocks.saveStructured,
}))

const client = createClient({ url: 'file::memory:' })
const database = createLibSqlDatabase(client)
afterAll(() => client.close())

describe('authorized fixed-file writes', () => {
  const user = {
    id: 'editor',
    name: 'Editor',
    email: 'editor@example.com',
    emailVerified: true,
    githubUsername: null,
  }
  const input = {
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    name: 'settings',
    sha: 'current-revision',
  }
  const calls: string[] = []

  beforeEach(() => {
    vi.restoreAllMocks()
    calls.length = 0
    mocks.configuration.mockReset().mockResolvedValue({
      object: {
        content: [
          { type: 'file', name: 'settings', path: 'data/settings.yaml' },
        ],
      },
    })
    const result = {
      path: 'data/settings.yaml',
      sha: 'new-revision',
      commitSha: 'commit',
      entry: { private: 'content' },
    }
    mocks.saveRaw.mockReset().mockImplementation(async () => {
      calls.push('write')
      return result
    })
    mocks.saveStructured.mockReset().mockImplementation(async () => {
      calls.push('write')
      return result
    })
  })

  function services() {
    const context = createRequestServices(
      {
        BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
        BETTER_AUTH_URL: 'https://example.com',
        DATABASE_URL: 'file::memory:',
      },
      new Headers(),
      { database, cacheDatabase: database },
    )
    const send = vi.fn<typeof fetch>()
    vi.spyOn(context.repositoryAccess, 'resolve').mockResolvedValue({
      api: createGitHubApi('test-token', send),
      tokenSource: 'installation',
      membershipId: 'membership',
    })
    vi.spyOn(context.repositoryAccess, 'executeMutation').mockImplementation(
      (_user, _repository, _kind, operation) => operation(),
    )
    context.access = createAccessPolicyGateway({
      policy: {
        authorize: async (request) => {
          calls.push(request.operation)
          return request.operation === 'entry.update' &&
            request.target?.collection === 'settings'
            ? { allowed: true }
            : { allowed: false, reason: 'permission_denied' }
        },
      },
    })
    return context
  }

  it('lets an editor without View save the configured path without returning its body', async () => {
    const data = {
      ...input,
      path: 'private/unconfigured.yaml',
      source: 'title: Updated',
    }
    const result = await saveFixedFile(services(), user, data)
    expect(mocks.saveRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'data/settings.yaml',
        source: data.source,
        sha: input.sha,
      }),
    )
    expect(calls.indexOf('entry.read')).toBeGreaterThan(calls.indexOf('write'))
    expect(result.entry).toBeUndefined()
  })

  it('retains structured list values for fixed files', async () => {
    await saveFixedFile(services(), user, {
      ...input,
      content: [{ title: 'One' }],
    })
    expect(mocks.saveStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'data/settings.yaml',
        content: [{ title: 'One' }],
      }),
    )
    expect(mocks.saveRaw).not.toHaveBeenCalled()
    expect(
      calls.filter((operation) => operation === 'entry.update'),
    ).toHaveLength(2)
  })

  it('preserves structured writes when an input also has an unrelated source property', async () => {
    const data = {
      ...input,
      content: { title: 'Structured' },
      source: 'Ignored',
    }
    await saveFixedFile(services(), user, data)
    expect(mocks.saveStructured).toHaveBeenCalledOnce()
    expect(mocks.saveRaw).not.toHaveBeenCalled()
  })

  it.each(['raw', 'structured'] as const)(
    'reauthorizes a %s fixed-file write after credential fallback',
    async (kind) => {
      const current = services()
      let fallback = false
      const api = createGitHubApi('test-token', vi.fn<typeof fetch>())
      vi.mocked(current.repositoryAccess.resolve).mockImplementation(
        async () => ({
          api,
          tokenSource: fallback ? 'installation' : 'user',
          ...(fallback ? { membershipId: 'membership' } : {}),
        }),
      )
      current.access = createAccessPolicyGateway({
        policy: {
          authorize: async (request) =>
            request.principal.type === 'collaborator'
              ? { allowed: false, reason: 'permission_denied' }
              : { allowed: true },
        },
      })
      vi.mocked(current.repositoryAccess.executeMutation).mockImplementation(
        async (_user, _repo, _kind, operation) => {
          try {
            return await operation()
          } catch (error) {
            if (!(error instanceof GitHubApiError)) throw error
            fallback = true
            return operation()
          }
        },
      )
      const writer = kind === 'raw' ? mocks.saveRaw : mocks.saveStructured
      writer.mockRejectedValueOnce(new GitHubApiError('Bad credentials', 401))
      await expect(
        saveFixedFile(current, user, {
          ...input,
          ...(kind === 'raw'
            ? { source: 'title: Updated' }
            : { content: { title: 'Updated' } }),
        }),
      ).rejects.toThrow('Access denied')
      expect(writer).toHaveBeenCalledOnce()
    },
  )

  it('denies an unassigned file before reading configuration or calling the writer', async () => {
    await expect(
      saveFixedFile(services(), user, {
        ...input,
        name: 'private',
        source: 'secret',
      }),
    ).rejects.toThrow('Access denied')
    expect(mocks.configuration).not.toHaveBeenCalled()
    expect(mocks.saveRaw).not.toHaveBeenCalled()
    expect(mocks.saveStructured).not.toHaveBeenCalled()
  })
})
