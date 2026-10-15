import { CONTENT_CONFLICT } from '#/lib/content-conflict'
import { isRepositoryProviderError } from './repository-provider.server'

export async function withContentConflict<T>(write: () => Promise<T>) {
  try {
    return await write()
  } catch (error) {
    if (isRepositoryProviderError(error, 409)) throw new Error(CONTENT_CONFLICT)
    throw error
  }
}
