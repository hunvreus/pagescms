import { afterEach, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { invalidateRepositories } from './repository-invalidation'
import { repositoryQueryOptions } from './repository'
import { queryKeys } from './keys'

const client = new QueryClient()
afterEach(() => client.clear())

it('invalidates every bootstrap alias for the same repository without touching reused addresses or another forge', async () => {
  const target = {
    owner: 'current-owner',
    repo: 'current-repo',
    branch: 'main',
    repoId: '42',
    source: 'github.com',
  }
  const addresses = [
    target,
    { ...target, owner: 'previous-owner', repo: 'previous-repo' },
    { ...target, repo: 'replacement' },
    { ...target, source: 'other-forge' },
  ]
  const keys = addresses.map((address) => [
    ...repositoryQueryOptions(address).queryKey,
  ])
  for (const [index, key] of keys.entries())
    client.setQueryData(key, {
      source: addresses[index].source,
      repository: { id: index === 2 ? 43 : 42 },
    })
  const content = [...queryKeys.branch(target), 'collection']
  client.setQueryData(content, [])
  await invalidateRepositories(client, target)
  expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
    true,
    true,
    false,
    false,
  ])
  expect(client.getQueryState(content)?.isInvalidated).toBe(false)
})
