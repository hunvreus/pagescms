import { createServerFn } from '@tanstack/react-start'

import { normalizeGitPath } from '#/lib/git-path'
import { repositoryRef } from '#/lib/repository'

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

function parseEntryUpdate(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (typeof value.source !== 'string' || typeof value.sha !== 'string') {
    throw new Error('Invalid entry update')
  }
  return { ...entry, source: value.source, sha: value.sha }
}

function parseStructuredEntryUpdate(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.sha !== 'string' ||
    typeof value.content !== 'object' ||
    value.content === null ||
    Array.isArray(value.content)
  ) {
    throw new Error('Invalid structured entry update')
  }
  return { ...entry, content: value.content, sha: value.sha }
}

function parseStructuredEntryCreate(input: unknown) {
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
    Array.isArray(value.content) ||
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

export const getRawEntry = createServerFn({ method: 'GET' })
  .validator(parseEntryRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.read',
        principal: { type: 'user', id: user.id },
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
          database: services.database,
          background: services.background,
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
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.update',
        principal: { type: 'user', id: user.id },
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
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
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
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.update',
        principal: { type: 'user', id: user.id },
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
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
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
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'entry.create',
        principal: { type: 'user', id: user.id },
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
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
