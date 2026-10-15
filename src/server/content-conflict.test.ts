import { expect, it } from 'vitest'
import { CONTENT_CONFLICT, isContentConflict } from '#/lib/content-conflict'
import { RepositoryProviderError } from './repository-provider.server'
import { withContentConflict } from './content-conflict.server'

it('exposes a stable conflict message through a plain serialized Error', async () => {
  await expect(
    withContentConflict(async () => {
      throw new RepositoryProviderError('provider-specific message', 409)
    }),
  ).rejects.toThrow(CONTENT_CONFLICT)
  expect(isContentConflict(new Error(CONTENT_CONFLICT))).toBe(true)
  expect(isContentConflict(new Error('unrelated failure'))).toBe(false)
})
it('does not misclassify validation, permission or transport errors', async () => {
  for (const error of [
    new RepositoryProviderError('invalid', 422),
    new RepositoryProviderError('forbidden', 403),
    new Error('Failed to fetch'),
  ])
    await expect(
      withContentConflict(async () => {
        throw error
      }),
    ).rejects.toBe(error)
})
