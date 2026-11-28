import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { describe, expect, it, vi } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { createD1Database } from '#/server/db/core'
import { readdir, readFile } from 'node:fs/promises'
import {
  accountTable,
  collaboratorTable,
  configTable,
  githubInstallationTokenTable,
  repositoryAddressTable,
  userTable,
} from '#/server/db/schema'
import { encryptSecret } from '#/server/auth/secret-crypto'
import { encryptOAuthToken } from '#/server/auth/oauth-token-crypto'
import { createGitHubAccountReader } from '#/server/auth/oauth-account'
import { createRepositoryAccessService as createProductionAccess } from '#/server/access/repository'
import { createConfigurationStore } from '#/server/cache/configuration'
import { createAccessPolicyGateway } from '#/server/access/policy'
import { withRepositoryPolicyIdentity } from '#/server/access/repository-identity-policy'
import {
  createRepositoryService,
  createRepositoryAccessService,
} from '#/server/__tests__/credentials'
import { readRepository } from '#/server/services/repository'
import {
  readCollection,
  readFixedFile,
  readRawEntry,
} from '#/server/services/content'
import { readMediaDirectory } from '#/server/services/media'
import { readReferenceOptions } from '#/server/services/reference'
import { readActions } from '#/server/services/actions'
import { readActivity } from '#/server/services/activity'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { loadConfigurationSource } from '#/server/services/configuration-editor'
import type { GitHubApi } from '#/server/github/api'
import type { ServiceContext } from '#/server/services/context'
import type { RequestServices } from '#/server/context'

describe('composed repository work budget', () => {
  it.each(['libsql', 'd1'] as const)(
    'reuses admission while loading workspace and configuration source (%s)',
    async (runtime) => {
      const client =
        runtime === 'libsql'
          ? createClient({ url: 'file::memory:' })
          : undefined
      const miniflare =
        runtime === 'd1'
          ? new (await import('miniflare')).Miniflare({
              modules: true,
              script:
                'export default { fetch() { return new Response("ok") } }',
              d1Databases: { DATABASE: 'work-budget' },
            })
          : undefined
      const binding = miniflare
        ? await miniflare.getD1Database('DATABASE')
        : undefined
      try {
        if (binding) {
          const files = (await readdir('./drizzle'))
            .filter((file) => file.endsWith('.sql'))
            .sort()
          for (const file of files) {
            const statements = (await readFile(`./drizzle/${file}`, 'utf8'))
              .split('--> statement-breakpoint')
              .map((part) => part.trim())
              .filter(Boolean)
            await binding.batch(
              statements.map((statement) => binding.prepare(statement)),
            )
          }
        }
        const prepare = binding && vi.fn((sql: string) => binding.prepare(sql))
        const d1Batch =
          binding &&
          vi.fn((statements: Parameters<typeof binding.batch>[0]) =>
            binding.batch(statements),
          )
        const execute = client ? vi.spyOn(client, 'execute') : prepare!
        const batch = client ? vi.spyOn(client, 'batch') : d1Batch!
        const database = binding
          ? createD1Database({
              prepare,
              batch: d1Batch,
            } as unknown as typeof binding)
          : createLibSqlDatabase(client!)
        if (client) await migrate(database, { migrationsFolder: './drizzle' })
        const user = {
          id: 'budget-user',
          name: 'Editor',
          email: 'budget@example.test',
          emailVerified: true,
          githubUsername: 'editor',
        }
        await database.insert(userTable).values(user)
        await database.insert(accountTable).values({
          id: 'budget-account',
          accountId: 'editor',
          providerId: 'github',
          userId: user.id,
          accessToken: 'test-token',
        })
        const repo = {
          id: 42,
          ownerId: 99,
          owner: 'budget',
          repo: 'repo',
          defaultBranch: 'main',
          private: true,
          canPush: true,
        }
        const api = {
          source: 'github.com',
          getRepository: vi.fn(async () => repo),
          branchExists: vi.fn(async () => true),
          getFile: vi.fn(async () => ({
            sha: 'cached-sha',
            content: btoa('content: []'),
          })),
          getDirectorySnapshot: vi.fn(async () => ({
            revision: 'head',
            entries: [
              {
                type: 'file',
                name: 'a.md',
                path: 'posts/a.md',
                sha: 'entry-sha',
                content: 'hello',
                size: 5,
                downloadUrl: null,
              },
            ],
          })),
          getRefSha: vi.fn(async () => 'head'),
          getMediaDirectory: vi.fn(async () => [
            {
              type: 'file',
              name: 'a.png',
              path: 'public/images/a.png',
              sha: 'image-sha',
              content: null,
              size: 5,
              downloadUrl: null,
            },
          ]),
        } as unknown as GitHubApi
        const factory = () => api
        const makeServices = () => {
          const repositoryAccess = createRepositoryAccessService({
            database,
            cacheDatabase: database,
            githubApp: undefined,
            githubApiFactory: factory,
          })
          return {
            database,
            cacheDatabase: database,
            repositoryAccess,
            access: withRepositoryPolicyIdentity(
              createAccessPolicyGateway({ required: false }),
              database,
              false,
            ),
            repositories: createRepositoryService(
              database,
              database,
              repositoryAccess,
              factory,
            ),
            mediaProviderResolver: undefined,
          } as ServiceContext
        }
        const input = {
          owner: repo.owner,
          repo: repo.repo,
          repoId: String(repo.id),
          branch: 'main',
        }
        const coldAdmission = await makeServices().repositoryAccess.resolve(
          user,
          repo.owner,
          repo.repo,
          input.branch,
          input.repoId,
        )
        expect(coldAdmission.identity?.externalId).toBe(input.repoId)
        expect(api.getRepository).toHaveBeenCalledTimes(1)
        expect(api.getRepository).toHaveBeenCalledWith(repo.owner, repo.repo, {
          fresh: false,
        })
        const collaborator = {
          id: 'budget-collaborator',
          name: 'Collaborator',
          email: 'collaborator@example.test',
          emailVerified: true,
          githubUsername: null,
        }
        await database.insert(userTable).values(collaborator)
        await database.insert(collaboratorTable).values({
          type: 'user',
          installationId: 43,
          ownerId: repo.ownerId,
          repoId: repo.id,
          owner: repo.owner,
          repo: repo.repo,
          email: collaborator.email,
          userId: collaborator.id,
        })
        const cryptoKey = btoa(
          String.fromCharCode(...new Uint8Array(32).fill(31)),
        )
        await database.insert(githubInstallationTokenTable).values({
          installationId: 43,
          ...(await encryptSecret('budget-installation-token', cryptoKey)),
          expiresAt: new Date(Date.now() + 600_000),
        })
        const collaboratorAccess = () =>
          createRepositoryAccessService({
            database,
            cacheDatabase: database,
            githubApp: { appId: '43', privateKey: 'unused', cryptoKey },
            githubApiFactory: factory,
          })
        await collaboratorAccess().resolve(
          collaborator,
          repo.owner,
          repo.repo,
          'main',
        )
        execute.mockClear()
        batch.mockClear()
        expect(
          (
            await collaboratorAccess().resolve(
              collaborator,
              repo.owner,
              repo.repo,
              'main',
            )
          ).tokenSource,
        ).toBe('installation')
        expect(execute.mock.calls.length).toBeLessThanOrEqual(2)
        expect(batch).not.toHaveBeenCalled()
        await database.delete(repositoryAddressTable)
        expect(
          (
            await collaboratorAccess().resolve(
              collaborator,
              repo.owner,
              repo.repo,
              'main',
            )
          ).identity?.externalId,
        ).toBe(String(repo.id))
        await createConfigurationStore({ database }).save(
          repo.owner,
          repo.repo,
          'main',
          'cached-sha',
          { content: [] },
        )
        const collaboratorServices = () => {
          const services = makeServices()
          const repositoryAccess = collaboratorAccess()
          return {
            ...services,
            repositoryAccess,
            repositories: createRepositoryService(
              database,
              database,
              repositoryAccess,
              factory,
            ),
          }
        }
        await readRepository(collaboratorServices(), collaborator, input)
        execute.mockClear()
        batch.mockClear()
        const collaboratorWorkspace = await readRepository(
          collaboratorServices(),
          collaborator,
          input,
        )
        expect(collaboratorWorkspace.configuration?.sha).toBe('cached-sha')
        expect(execute.mock.calls.length).toBeLessThanOrEqual(3)
        expect(
          execute.mock.calls.filter(([statement]) => {
            const query = statement as unknown as string | { sql: string }
            return /^\s*select\b/i.test(
              typeof query === 'string' ? query : query.sql,
            )
          }),
        ).toHaveLength(2)
        expect(batch).not.toHaveBeenCalled()
        vi.mocked(api.getFile).mockClear()
        const newCollaboratorBranch = await readRepository(
          collaboratorServices(),
          collaborator,
          { ...input, branch: 'collaborator-only' },
        )
        expect(newCollaboratorBranch.configuration?.branch).toBe(
          'collaborator-only',
        )
        expect(api.getFile).toHaveBeenCalledOnce()
        const directUser = {
          ...user,
          id: 'budget-direct',
          email: 'direct@example.test',
        }
        const secret = 'budget-secret-with-at-least-thirty-two-characters'
        await database.insert(userTable).values(directUser)
        await database.insert(accountTable).values({
          id: 'budget-direct-account',
          accountId: 'direct',
          providerId: 'github',
          userId: directUser.id,
          accessToken: await encryptOAuthToken('budget-direct-token', secret),
        })
        const productionServices = () => {
          const services = makeServices()
          const repositoryAccess = createProductionAccess({
            database,
            cacheDatabase: database,
            githubApp: undefined,
            githubApiFactory: factory,
            readGitHubAccount: createGitHubAccountReader(database, secret),
          })
          return {
            ...services,
            repositoryAccess,
            repositories: createRepositoryService(
              database,
              database,
              repositoryAccess,
              factory,
            ),
          }
        }
        await readRepository(productionServices(), directUser, input)
        execute.mockClear()
        batch.mockClear()
        const directWorkspace = await readRepository(
          productionServices(),
          directUser,
          input,
        )
        expect(directWorkspace.repository.id).toBe(repo.id)
        expect(directWorkspace.configuration?.sha).toBe('cached-sha')
        expect(execute.mock.calls.length).toBeLessThanOrEqual(2)
        expect(
          execute.mock.calls.filter(([statement]) => {
            const query = statement as unknown as string | { sql: string }
            return /^\s*select\b/i.test(
              typeof query === 'string' ? query : query.sql,
            )
          }),
        ).toHaveLength(1)
        expect(batch).not.toHaveBeenCalled()
        const branchServices = productionServices()
        await readRepository(branchServices, directUser, input)
        vi.mocked(api.getFile).mockClear()
        const otherBranch = await readRepository(branchServices, directUser, {
          ...input,
          branch: 'other',
        })
        expect(otherBranch.configuration?.branch).toBe('other')
        expect(api.getFile).toHaveBeenCalledOnce()
        await database.delete(configTable)
        vi.mocked(api.getFile).mockClear()
        const reloaded = await readRepository(
          productionServices(),
          directUser,
          input,
        )
        expect(reloaded.configuration?.sha).toBe('cached-sha')
        expect(api.getFile).toHaveBeenCalledOnce()
        await database.update(configTable).set({ version: 'outdated' })
        vi.mocked(api.getFile).mockClear()
        const upgraded = await readRepository(
          productionServices(),
          directUser,
          input,
        )
        expect(upgraded.configuration?.version).not.toBe('outdated')
        expect(api.getFile).toHaveBeenCalledOnce()
        const run = async () => {
          const services = makeServices()
          const workspace = await readRepository(services, user, input)
          const principal = await resolveRepositoryPrincipal(
            services.repositoryAccess,
            user,
            input,
          )
          const source = await services.access.execute(
            {
              operation: 'configuration.read',
              principal,
              tenant: { type: 'repository', id: 'budget/repo' },
              target: {
                repository: input,
                branch: input.branch,
                path: '.pages.yml',
              },
            },
            () =>
              loadConfigurationSource({
                repositoryAccess: services.repositoryAccess,
                user,
                ...input,
              }),
          )
          expect(workspace.repository.id).toBe(repo.id)
          expect(source.source).toBe('content: []')
        }
        await run()
        vi.mocked(api.getRepository).mockClear()
        vi.mocked(api.branchExists).mockClear()
        execute.mockClear()
        batch.mockClear()
        const workspace = await readRepository(makeServices(), user, input)
        expect(workspace.repository.id).toBe(repo.id)
        expect(api.branchExists).not.toHaveBeenCalled()
        expect(execute.mock.calls.length).toBeGreaterThan(0)
        expect(execute.mock.calls.length).toBeLessThanOrEqual(4)
        expect(batch).not.toHaveBeenCalled()
        vi.mocked(api.getRepository).mockClear()
        execute.mockClear()
        batch.mockClear()
        await run()
        expect(api.getRepository).toHaveBeenCalledTimes(1)
        expect(batch).not.toHaveBeenCalled()
        expect(execute.mock.calls.length).toBeLessThanOrEqual(15)

        await createConfigurationStore({ database }).save(
          repo.owner,
          repo.repo,
          'main',
          'entry-config',
          {
            content: [
              { name: 'posts', type: 'collection', path: 'posts' },
              { name: 'groups', type: 'file', path: 'groups.yml' },
            ],
            media: [
              {
                name: 'images',
                input: 'public/images',
                output: 'public/images',
              },
            ],
          },
        )
        execute.mockClear()
        batch.mockClear()
        const entry = await readRawEntry(makeServices(), user, {
          ...input,
          name: 'posts',
          path: 'posts/a.md',
        })
        expect(entry.sha).toBe('cached-sha')
        expect(execute.mock.calls.length).toBeLessThanOrEqual(3)
        expect(batch).not.toHaveBeenCalled()
        execute.mockClear()
        batch.mockClear()
        const activity = await readActivity(
          makeServices() as RequestServices,
          user,
          {
            ...input,
            page: 0,
          },
        )
        expect(activity.items).toEqual([])
        expect(execute.mock.calls.length).toBeLessThanOrEqual(4)
        expect(batch).not.toHaveBeenCalled()
        execute.mockClear()
        batch.mockClear()
        const file = await readFixedFile(makeServices(), user, {
          ...input,
          name: 'groups',
        })
        expect(file.sha).toBe('cached-sha')
        expect(execute.mock.calls.length).toBeLessThanOrEqual(4)
        expect(batch).not.toHaveBeenCalled()
        const collectionInput = { ...input, name: 'posts' }
        await readCollection(makeServices(), user, collectionInput)
        execute.mockClear()
        batch.mockClear()
        const collection = await readCollection(
          makeServices(),
          user,
          collectionInput,
        )
        expect(collection.contents).toHaveLength(1)
        expect(execute.mock.calls.length).toBeLessThanOrEqual(4)
        expect(batch).not.toHaveBeenCalled()
        const mediaInput = { ...input, name: 'images' }
        await readMediaDirectory(makeServices(), user, mediaInput)
        execute.mockClear()
        batch.mockClear()
        const media = await readMediaDirectory(makeServices(), user, mediaInput)
        expect(media.entries).toHaveLength(1)
        expect(execute.mock.calls.length).toBeLessThanOrEqual(4)
        expect(batch).not.toHaveBeenCalled()
        const referenceInput = {
          ...input,
          collection: 'posts',
          locale: undefined,
          cursor: undefined,
          query: '',
          valueTemplate: '{path}',
          labelTemplate: '{name}',
          searchFields: ['name'],
          selectedValues: [],
        }
        await readReferenceOptions(
          makeServices() as RequestServices,
          user,
          referenceInput,
        )
        execute.mockClear()
        batch.mockClear()
        const references = await readReferenceOptions(
          makeServices() as RequestServices,
          user,
          referenceInput,
        )
        expect(references.options).toHaveLength(1)
        expect(execute.mock.calls.length).toBeLessThanOrEqual(4)
        expect(batch).not.toHaveBeenCalled()
        execute.mockClear()
        batch.mockClear()
        const actions = await readActions(makeServices(), user, {
          ...input,
          includeRuns: false,
        })
        expect(actions).toMatchObject({ actions: [], runs: [] })
        expect(execute.mock.calls.length).toBeLessThanOrEqual(3)
        expect(batch).not.toHaveBeenCalled()
        vi.mocked(api.getRepository).mockResolvedValueOnce({
          ...repo,
          repo: 'renamed',
        })
        const renamed = await productionServices().repositoryAccess.resolve(
          directUser,
          repo.owner,
          repo.repo,
          input.branch,
          input.repoId,
        )
        expect(renamed.repository?.repo).toBe('renamed')
        expect(renamed.identity?.externalId).toBe(input.repoId)
      } finally {
        client?.close()
        await miniflare?.dispose()
      }
    },
    30_000,
  )
})
