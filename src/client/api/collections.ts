import { notFound } from '@tanstack/react-router'
import { ApiNotFoundError, readApi } from '#/client/api/index'
import { parseCollectionRequest } from '#/shared/requests/collection'
import type { readCollection } from '#/server/services/content'

export class CollectionAccessDenied extends Error {}

export async function getCollection(
  input: unknown,
): ReturnType<typeof readCollection> {
  const { owner, repo, branch, name, repoId, locale, path, forceRefresh } =
    parseCollectionRequest(input)
  const params = new URLSearchParams({ owner, repo, branch, name })
  if (repoId) params.set('repoId', repoId)
  if (locale) params.set('locale', locale)
  if (path) params.set('path', path)
  if (forceRefresh) params.set('forceRefresh', 'true')
  try {
    return await readApi(`/api/collections?${params}`)
  } catch (error) {
    if (error instanceof ApiNotFoundError) throw notFound()
    if (error instanceof Error && error.name === 'AccessDeniedError')
      throw new CollectionAccessDenied('Access denied: permission_denied')
    throw error
  }
}
