import { loadCollection } from '#/server/content/collection'
import {
  createContentFolder,
  deleteContentEntry,
  loadEntryHistory,
  loadFixedFile,
  loadRawEntry,
  moveContentEntry,
  planContentRename,
  renameContentEntry,
} from '#/server/content/entry-editor'
import { contentWriteResponse } from '#/server/content/write-response'
import { admittedConfigurationScope } from '#/server/cache/configuration'
import { findContentSchema } from '#/shared/configuration-content'
import { contentI18n, localizedPath } from '#/lib/i18n'
import * as editor from '#/server/content/entry-editor'
import { normalizeGitPath } from '#/shared/git-path'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { repositoryTenant } from '#/server/services/context'

import type { ContentOperations } from '#/lib/content-operations'
import type { AccessRequest } from '#/server/access/policy'
import type { ServiceContext, ServiceUser } from '#/server/services/context'

type Repository = { owner: string; repo: string; repoId?: string }
type EntryInput = Repository & { branch: string; name: string; path: string }
type Move = { path: string; newPath: string; sha: string; revision?: string }

function principal(
  services: ServiceContext,
  user: ServiceUser,
  data: Repository & { branch?: string },
) {
  return resolveRepositoryPrincipal(services.repositoryAccess, user, data)
}

function allowedContentOperations(
  operations: ContentOperations,
  denied?: readonly AccessRequest['operation'][],
): ContentOperations {
  if (!denied?.length) return operations
  return {
    create: operations.create && !denied.includes('entry.create'),
    rename: operations.rename && !denied.includes('entry.rename'),
    delete: operations.delete && !denied.includes('entry.delete'),
  }
}

export async function readCollection(
  services: ServiceContext,
  user: ServiceUser,
  data: Repository & {
    branch: string
    name: string
    locale?: string
    path?: string
    forceRefresh?: boolean
  },
) {
  data = {
    ...data,
    path: data.path === undefined ? undefined : normalizeGitPath(data.path),
  }
  return services.access.execute(
    {
      operation: 'collection.read',
      principal: await principal(services, user, data),
      tenant: repositoryTenant(data),
      target: {
        repository: { owner: data.owner, repo: data.repo, repoId: data.repoId },
        branch: data.branch,
        collection: data.name,
        ...(data.path ? { path: data.path } : {}),
      },
    },
    async (grant) => {
      const result = await loadCollection({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
      const operations = allowedContentOperations(
        result.collection.operations,
        grant?.deniedOperations,
      )
      return {
        ...result,
        collection: {
          ...result.collection,
          operations,
          ...(grant?.deniedOperations?.includes('entry.update')
            ? { editable: false as const }
            : {}),
        },
      }
    },
  )
}

export async function readRawEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: EntryInput,
) {
  data = { ...data, path: normalizeGitPath(data.path) }
  return services.access.execute(
    {
      operation: 'entry.read',
      principal: await principal(services, user, data),
      tenant: repositoryTenant(data),
      target: {
        repository: data,
        branch: data.branch,
        collection: data.name,
        path: data.path,
      },
    },
    async (grant) => {
      const result = await loadRawEntry({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
      return {
        ...result,
        ...(grant?.deniedOperations?.includes(
          result.sha ? 'entry.update' : 'entry.create',
        )
          ? { editable: false as const }
          : {}),
        operations: allowedContentOperations(
          result.operations,
          grant?.deniedOperations,
        ),
      }
    },
  )
}

export async function readFixedFile(
  services: ServiceContext,
  user: ServiceUser,
  data: Repository & { branch: string; name: string; locale?: string },
) {
  return services.access.execute(
    {
      operation: 'entry.read',
      principal: await principal(services, user, data),
      tenant: repositoryTenant(data),
      target: { repository: data, branch: data.branch, collection: data.name },
    },
    async (grant) => {
      const result = await loadFixedFile({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
      return {
        ...result,
        ...(grant?.deniedOperations?.includes(
          result.sha ? 'entry.update' : 'entry.create',
        )
          ? { editable: false as const }
          : {}),
        operations: allowedContentOperations(
          result.operations,
          grant?.deniedOperations,
        ),
      }
    },
  )
}

function entryWriteRequest(
  operation: AccessRequest['operation'],
  resolved: AccessRequest['principal'],
  data: Repository & { branch: string; name: string; path?: string },
): AccessRequest {
  return {
    operation,
    principal: resolved,
    tenant: repositoryTenant(data),
    target: {
      repository: data,
      branch: data.branch,
      collection: data.name,
      ...(data.path === undefined ? {} : { path: data.path }),
    },
  }
}

type SaveInput = EntryInput & { sha: string | null; message?: string } & (
    { source: string } | { content: object }
  )

async function saveEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: SaveInput,
  kind: 'raw' | 'structured',
) {
  data = { ...data, path: normalizeGitPath(data.path) }
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'single',
    async () => {
      // Credential fallback can replay this callback with a different principal.
      const request = entryWriteRequest(
        data.sha ? 'entry.update' : 'entry.create',
        await principal(services, user, data),
        data,
      )
      return services.access.execute(request, async () => {
        const input = {
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
          sha: data.sha ?? undefined,
        }
        const write =
          kind === 'raw' && 'source' in input
            ? () => editor.saveRawEntry(input)
            : kind === 'structured' && 'content' in input
              ? () => editor.saveStructuredEntry(input)
              : undefined
        if (!write) throw new Error('Invalid entry payload')
        const result = await write()
        return contentWriteResponse(services.access, request, result)
      })
    },
  )
}

export async function planEntryRename(
  services: ServiceContext,
  user: ServiceUser,
  data: EntryInput & { sha: string; filename?: string; newPath?: string },
) {
  data = { ...data, path: normalizeGitPath(data.path) }
  const resolved = await principal(services, user, data)
  return services.access.execute(
    entryWriteRequest('entry.rename', resolved, data),
    async () => {
      const moves = await planContentRename({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
      for (const move of moves)
        await moveAuthorizer(services, resolved, data)(move.path, move.newPath)
      return moves
    },
  )
}

export async function readEntryHistory(
  services: ServiceContext,
  user: ServiceUser,
  input: EntryInput & { page: number },
) {
  const { page, ...request } = input
  const data = { ...request, path: normalizeGitPath(request.path) }
  return services.access.execute(
    entryWriteRequest(
      'entry.history',
      await principal(services, user, data),
      data,
    ),
    async () => {
      return loadEntryHistory({
        database: services.cacheDatabase,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
        page,
      })
    },
  )
}

export async function saveRawEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: EntryInput & { source: string; sha: string | null; message?: string },
) {
  return saveEntry(services, user, data, 'raw')
}

export async function saveStructuredEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: EntryInput & { content: object; sha: string | null; message?: string },
) {
  return saveEntry(services, user, data, 'structured')
}

/** Resolve a configured fixed-file path without requiring permission to read it. */
export async function saveFixedFile(
  services: ServiceContext,
  user: ServiceUser,
  data: Repository & {
    branch: string
    name: string
    locale?: string
    sha: string | null
    message?: string
  } & ({ content: object } | { source: string }),
) {
  const resolved = await principal(services, user, data)
  await services.access.authorize(
    entryWriteRequest(data.sha ? 'entry.update' : 'entry.create', resolved, {
      owner: data.owner,
      repo: data.repo,
      branch: data.branch,
      name: data.name,
    }),
  )
  const {
    api,
    repository,
    identity: admittedIdentity,
  } = await services.repositoryAccess.resolve(
    user,
    data.owner,
    data.repo,
    data.branch,
    data.repoId,
  )
  const configuration = await services.repositoryAccess.configurationStore.get(
    api,
    data.owner,
    data.repo,
    data.branch,
    repository ? String(repository.id) : undefined,
    repository && admittedConfigurationScope(admittedIdentity),
  )
  if (!configuration) throw new Error('Repository configuration not found')
  const schema = findContentSchema(configuration.object, data.name)
  if (!schema || schema.type !== 'file')
    throw new Error(`File ${data.name} was not found`)
  const path = localizedPath(
    schema,
    schema.path,
    data.locale ?? contentI18n(schema)?.default ?? '',
  )
  return saveEntry(
    services,
    user,
    { ...data, path },
    'content' in data ? 'structured' : 'raw',
  )
}

type CreateInput = Repository & {
  branch: string
  name: string
  locale?: string
  parent?: string
  filename?: string
  message?: string
}

async function createEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: CreateInput & ({ content: object } | { source: string }),
  kind: 'raw' | 'structured',
) {
  data = {
    ...data,
    parent:
      data.parent === undefined ? undefined : normalizeGitPath(data.parent),
  }
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'single',
    async () => {
      const request = entryWriteRequest(
        'entry.create',
        await principal(services, user, data),
        {
          ...data,
          path: data.parent,
        },
      )
      return services.access.execute(request, async () => {
        const input = {
          authorizeWrite: async (path: string) => {
            await services.access.authorize({
              ...request,
              target: { ...request.target, path: normalizeGitPath(path) },
            })
          },
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        }
        const create =
          kind === 'raw' && 'source' in input
            ? () => editor.createRawEntry(input)
            : kind === 'structured' && 'content' in input
              ? () => editor.createStructuredEntry(input)
              : undefined
        if (!create) throw new Error('Invalid entry payload')
        const result = await create()
        return contentWriteResponse(services.access, request, result)
      })
    },
  )
}

export async function createStructuredEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: CreateInput & { content: object },
) {
  return createEntry(services, user, data, 'structured')
}

export async function createRawEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: CreateInput & { source: string },
) {
  return createEntry(services, user, data, 'raw')
}

export async function createCollectionFolder(
  services: ServiceContext,
  user: ServiceUser,
  data: Repository & {
    branch: string
    name: string
    parent: string
    folder: string
    locale?: string
  },
) {
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'single',
    async () => {
      const resolved = await principal(services, user, data)
      const request: AccessRequest = {
        operation: 'entry.create',
        principal: resolved,
        tenant: repositoryTenant(data),
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.parent,
        },
      }
      return services.access.execute(request, async () => {
        return createContentFolder({
          authorizeWrite: (path) =>
            services.access.execute(
              {
                ...request,
                target: { ...request.target, path: normalizeGitPath(path) },
              },
              async () => undefined,
            ),
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      })
    },
  )
}

export async function deleteEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: EntryInput & { sha: string },
) {
  data = { ...data, path: normalizeGitPath(data.path) }
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'single',
    async () =>
      services.access.execute(
        entryWriteRequest(
          'entry.delete',
          await principal(services, user, data),
          data,
        ),
        async () => {
          return deleteContentEntry({
            database: services.cacheDatabase,
            repositoryAccess: services.repositoryAccess,
            user,
            ...data,
          })
        },
      ),
  )
}

function moveAuthorizer(
  services: ServiceContext,
  resolved: AccessRequest['principal'],
  data: EntryInput,
) {
  return async (path: string, newPath: string) => {
    await services.access.execute(
      {
        ...entryWriteRequest('entry.rename', resolved, {
          ...data,
          path: normalizeGitPath(path),
        }),
        facts: { newPath: normalizeGitPath(newPath) },
      },
      async () => undefined,
    )
  }
}

export async function renameEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: EntryInput & {
    sha: string
    filename: string
    confirmedMoves?: Move[]
  },
) {
  data = { ...data, path: normalizeGitPath(data.path) }
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'multi',
    async () => {
      const resolved = await principal(services, user, data)
      return services.access.execute(
        entryWriteRequest('entry.rename', resolved, data),
        async () => {
          return renameContentEntry({
            authorizeMove: moveAuthorizer(services, resolved, data),
            database: services.cacheDatabase,
            repositoryAccess: services.repositoryAccess,
            user,
            ...data,
          })
        },
      )
    },
  )
}

export async function moveEntry(
  services: ServiceContext,
  user: ServiceUser,
  data: EntryInput & { sha: string; newPath: string; confirmedMoves?: Move[] },
) {
  data = {
    ...data,
    path: normalizeGitPath(data.path),
    newPath: normalizeGitPath(data.newPath),
  }
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'multi',
    async () => {
      const resolved = await principal(services, user, data)
      return services.access.execute(
        {
          ...entryWriteRequest('entry.rename', resolved, data),
          facts: { newPath: data.newPath },
        },
        async () => {
          return moveContentEntry({
            authorizeMove: moveAuthorizer(services, resolved, data),
            database: services.cacheDatabase,
            repositoryAccess: services.repositoryAccess,
            user,
            ...data,
          })
        },
      )
    },
  )
}
