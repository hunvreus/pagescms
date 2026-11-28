import { expect, it, vi } from 'vitest'
import {
  readRepositoryCached,
  registerRepositoryReader,
} from '#/server/cache/repository-read'
import { defaultCachePolicy, parseCachePolicy } from '#/server/cache/policy'

it('does not expose one credential’s cached data to another', async () => {
  const first = {},
    second = {}
  registerRepositoryReader(first, 'first-token')
  registerRepositoryReader(second, 'second-token')
  const read = (api: object, value: string) =>
    readRepositoryCached(
      api,
      'owner',
      'repo',
      'security-fixture',
      15_000,
      async () => value,
    )
  expect(await read(first, 'private-a')).toBe('private-a')
  expect(await read(second, 'private-b')).toBe('private-b')
})

it('does not share pending provider I/O between requests', async () => {
  const first = {},
    second = {}
  registerRepositoryReader(first, 'same-token')
  registerRepositoryReader(second, 'same-token')
  let finish!: (value: string) => void
  const pending = readRepositoryCached(
    first,
    'owner',
    'repo',
    'pending-fixture',
    15_000,
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  await expect(
    readRepositoryCached(
      second,
      'owner',
      'repo',
      'pending-fixture',
      15_000,
      async () => 'second',
    ),
  ).resolves.toBe('second')
  finish('first')
  await expect(pending).resolves.toBe('first')
})

it('accepts cache policy settings', () => {
  expect(parseCachePolicy({})).toEqual(defaultCachePolicy)
  expect(
    parseCachePolicy({
      FILE_TTL_MIN: '-1',
      CACHE_CHECK_MIN: '2',
      REPO_META_TTL_MS: '40',
      WEBHOOK_PUSH_INCREMENTAL_MAX_FILES: '0',
    }),
  ).toMatchObject({
    fileMs: -1,
    checkMs: 120_000,
    repositoryMs: 40,
    incrementalMax: 0,
  })
  expect(
    parseCachePolicy({ CFG_CHECK_MIN: '2', CONFIG_CHECK_TTL: '3' })
      .configCheckMs,
  ).toBe(120_000)
  expect(
    parseCachePolicy({ CONFIG_CHECK_MIN: '1', CFG_CHECK_MIN: '2' })
      .configCheckMs,
  ).toBe(60_000)
  expect(parseCachePolicy({ CONFIG_CHECK_TTL: '3' }).configCheckMs).toBe(
    180_000,
  )
  expect(() => parseCachePolicy({ CACHE_CHECK_MIN: 'NaN' })).toThrow()
})
