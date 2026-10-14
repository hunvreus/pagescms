import { expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { hasPendingPathWrite } from './pending-write'

it('prevents writes across media, configuration, and aliased content views without locking other paths or accounts', async () => {
  const client = new QueryClient()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const coordinates = { owner: 'Owner', repo: 'Repo', branch: 'main' }
  const mutation = client
    .getMutationCache()
    .build(client, { mutationKey: ['configuration'], mutationFn: () => held })
  const result = mutation.execute({
    account: 'user',
    coordinates,
    paths: ['.pages.yml'],
  })
  try {
    expect(
      hasPendingPathWrite(client, 'user', { ...coordinates, owner: 'owner' }, [
        '.pages.yml',
      ]),
    ).toBe(true)
    expect(
      hasPendingPathWrite(client, 'other', coordinates, ['.pages.yml']),
    ).toBe(false)
    expect(
      hasPendingPathWrite(client, 'user', { ...coordinates, branch: 'other' }, [
        '.pages.yml',
      ]),
    ).toBe(false)
    expect(
      hasPendingPathWrite(client, 'user', coordinates, ['content/entry.md']),
    ).toBe(false)
  } finally {
    release()
    await result
  }
  expect(hasPendingPathWrite(client, 'user', coordinates, ['.pages.yml'])).toBe(
    false,
  )
  const move = client
    .getMutationCache()
    .build(client, { mutationKey: ['content'], mutationFn: () => held })
  const moved = move.execute({
    account: 'user',
    coordinates: { ...coordinates, path: 'old.md' },
    destination: 'new.md',
  })
  expect(hasPendingPathWrite(client, 'user', coordinates, ['old.md'])).toBe(
    true,
  )
  expect(hasPendingPathWrite(client, 'user', coordinates, ['new.md'])).toBe(
    true,
  )
  await moved
  client.clear()
})
