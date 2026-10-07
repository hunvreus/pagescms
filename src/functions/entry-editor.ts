import { createServerFn } from '@tanstack/react-start'

import { normalizeGitPath } from '#/lib/git-path'
import { repositoryRef } from '#/lib/repository'
import { resolveRepositoryPrincipal } from '#/server/repository-policy.server'

function parseEntryRequest(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid entry request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.path !== 'string'
  ) {
    throw new Error('Invalid entry request')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
    name: value.name,
    path: normalizeGitPath(value.path),
  }
}

export function parseEntryUpdate(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.source !== 'string' ||
    (value.sha !== null && typeof value.sha !== 'string')
  ) {
    throw new Error('Invalid entry update')
  }
  return { ...entry, source: value.source, sha: value.sha }
}

function parseEntryDelete(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (typeof value.sha !== 'string' || !value.sha) {
    throw new Error('Invalid entry deletion')
  }
  return { ...entry, sha: value.sha }
}

function parseEntryRename(input: unknown) {
  const entry = parseEntryDelete(input)
  const value = input as Record<string, unknown>
  if (typeof value.filename !== 'string') {
    throw new Error('Invalid entry rename')
  }
  return { ...entry, filename: value.filename }
}

export function parseEntryMove(input: unknown) {
  const entry = parseEntryDelete(input)
  const value = input as Record<string, unknown>
  if (typeof value.newPath !== 'string') {
    throw new Error('Invalid entry move')
  }
  const newPath = normalizeGitPath(value.newPath.trim())
  if (!newPath) throw new Error('Invalid entry move')
  return { ...entry, newPath }
}

export function parseStructuredEntryUpdate(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (
    (value.sha !== null && typeof value.sha !== 'string') ||
    typeof value.content !== 'object' ||
    value.content === null
  ) {
    throw new Error('Invalid structured entry update')
  }
  return { ...entry, content: value.content, sha: value.sha }
}

export function parseStructuredEntryCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid entry creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/') ||
    typeof value.content !== 'object' ||
    value.content === null ||
    (value.parent !== undefined && typeof value.parent !== 'string') ||
    (value.filename !== undefined && typeof value.filename !== 'string')
  ) {
    throw new Error('Invalid entry creation')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
    name: value.name,
    content: value.content,
    ...(value.parent ? { parent: normalizeGitPath(value.parent) } : {}),
    ...(value.filename !== undefined ? { filename: value.filename } : {}),
  }
}

export function parseRawEntryCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid raw entry creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/') ||
    typeof value.source !== 'string' ||
    (value.parent !== undefined && typeof value.parent !== 'string') ||
    (value.filename !== undefined && typeof value.filename !== 'string')
  ) {
    throw new Error('Invalid raw entry creation')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
    name: value.name,
    source: value.source,
    ...(value.parent ? { parent: normalizeGitPath(value.parent) } : {}),
    ...(value.filename !== undefined ? { filename: value.filename } : {}),
  }
}

export function parseCollectionFolderCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid folder creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/') ||
    typeof value.parent !== 'string' ||
    typeof value.folder !== 'string'
  ) {
    throw new Error('Invalid folder creation')
  }
  const folder = normalizeGitPath(value.folder.trim())
  if (!folder || folder.split('/').some((part) => part === '.gitkeep')) {
    throw new Error('Folder name is invalid')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
    name: value.name,
    parent: normalizeGitPath(value.parent),
    folder,
  }
}

export const getRawEntry = createServerFn({ method: 'GET' })
  .validator(parseEntryRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.read',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.path,
        },
      },
      async () => {
        const { loadRawEntry } = await import('#/server/entry-editor.server')
        return loadRawEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const getEntryHistory = createServerFn({ method: 'GET' })
  .validator(parseEntryRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.history',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.path,
        },
      },
      async () => {
        const { loadEntryHistory } =
          await import('#/server/entry-editor.server')
        return loadEntryHistory({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const updateRawEntry = createServerFn({ method: 'POST' })
  .validator(parseEntryUpdate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: data.sha ? 'entry.update' : 'entry.create',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.path,
        },
      },
      async () => {
        const { saveRawEntry } = await import('#/server/entry-editor.server')
        return saveRawEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
          sha: data.sha ?? undefined,
        })
      },
    )
  })

export const updateStructuredEntry = createServerFn({ method: 'POST' })
  .validator(parseStructuredEntryUpdate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: data.sha ? 'entry.update' : 'entry.create',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.path,
        },
      },
      async () => {
        const { saveStructuredEntry } =
          await import('#/server/entry-editor.server')
        return saveStructuredEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
          sha: data.sha ?? undefined,
        })
      },
    )
  })

export const createStructuredCollectionEntry = createServerFn({
  method: 'POST',
})
  .validator(parseStructuredEntryCreate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.create',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          ...(data.parent ? { path: data.parent } : {}),
        },
      },
      async () => {
        const { createStructuredEntry } =
          await import('#/server/entry-editor.server')
        return createStructuredEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const createRawCollectionEntry = createServerFn({ method: 'POST' })
  .validator(parseRawEntryCreate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.create',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          ...(data.parent ? { path: data.parent } : {}),
        },
      },
      async () => {
        const { createRawEntry } = await import('#/server/entry-editor.server')
        return createRawEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const createCollectionFolder = createServerFn({ method: 'POST' })
  .validator(parseCollectionFolderCreate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.create',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.parent,
        },
      },
      async () => {
        const { createContentFolder } =
          await import('#/server/entry-editor.server')
        return createContentFolder({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const deleteEntry = createServerFn({ method: 'POST' })
  .validator(parseEntryDelete)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.delete',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.path,
        },
      },
      async () => {
        const { deleteContentEntry } =
          await import('#/server/entry-editor.server')
        return deleteContentEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const renameEntry = createServerFn({ method: 'POST' })
  .validator(parseEntryRename)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.rename',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.path,
        },
      },
      async () => {
        const { renameContentEntry } =
          await import('#/server/entry-editor.server')
        return renameContentEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const moveEntry = createServerFn({ method: 'POST' })
  .validator(parseEntryMove)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.rename',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
          path: data.path,
        },
        facts: { newPath: data.newPath },
      },
      async () => {
        const { moveContentEntry } =
          await import('#/server/entry-editor.server')
        return moveContentEntry({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
