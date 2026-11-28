import { CONTENT_CONFLICT } from '#/shared/content-conflict'
import { isRepositoryProviderError } from '../repository/provider'

export async function withContentConflict<T>(write: () => Promise<T>) {
  try {
    return await write()
  } catch (error) {
    if (isRepositoryProviderError(error, 409)) throw new Error(CONTENT_CONFLICT)
    throw error
  }
}
