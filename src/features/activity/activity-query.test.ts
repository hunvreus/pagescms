import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { queryKeys } from '#/client/queries/keys'
import { invalidateActivity } from './activity-query'

it('invalidates activity across repository branches without refreshing other queries or repositories', () => {
  const client = new QueryClient()
  const repository = { owner: 'owner', repo: 'repo' }
  const main = [
    ...queryKeys.branch({ ...repository, branch: 'main' }),
    'activity',
    0,
  ]
  const otherBranch = [
    ...queryKeys.branch({ ...repository, branch: 'other' }),
    'activity',
    1,
  ]
  const otherRepository = [
    ...queryKeys.branch({ owner: 'owner', repo: 'other', branch: 'main' }),
    'activity',
    0,
  ]
  const editor = [
    ...queryKeys.branch({ ...repository, branch: 'main' }),
    'files',
    'posts',
  ]
  for (const key of [main, otherBranch, otherRepository, editor])
    client.setQueryData(key, {})
  invalidateActivity(client, repository)
  expect(client.getQueryState(main)?.isInvalidated).toBe(true)
  expect(client.getQueryState(otherBranch)?.isInvalidated).toBe(true)
  expect(client.getQueryState(otherRepository)?.isInvalidated).toBe(false)
  expect(client.getQueryState(editor)?.isInvalidated).toBe(false)
  client.clear()
})
