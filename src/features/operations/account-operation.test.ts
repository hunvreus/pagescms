import { expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/queries/session'
import { accountIsActive, runAccountOperation } from './account-operation'

function setup() {
  const client = new QueryClient()
  const key = [...authenticationQueryOptions().queryKey]
  const switchAccount = (id: string | null) =>
    client.setQueryData(key, { user: id ? { id } : null })
  switchAccount('original')
  return { client, switchAccount }
}
it('does not dispatch a save when the account changes during local draft persistence', async () => {
  const { client, switchAccount } = setup()
  let release!: () => void
  const persistence = new Promise<void>((resolve) => {
    release = resolve
  })
  const prepare = vi.fn(() => persistence)
  const run = vi.fn(async () => 'committed')
  const result = runAccountOperation(client, {
    account: 'original',
    prepare,
    run,
  })
  const rejected = expect(result).rejects.toThrow('account changed')
  expect(prepare).toHaveBeenCalledOnce()
  switchAccount('other')
  release()
  await rejected
  expect(run).not.toHaveBeenCalled()
  client.clear()
})
it('rejects an old operation before any preparation or request, including after sign-out', async () => {
  const { client, switchAccount } = setup()
  switchAccount(null)
  const prepare = vi.fn(async () => {})
  const run = vi.fn(async () => 'committed')
  await expect(
    runAccountOperation(client, { account: 'original', prepare, run }),
  ).rejects.toThrow('not sent')
  expect(prepare).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
  client.clear()
})
it('runs local preparation once and sends one request when the account remains unchanged', async () => {
  const { client } = setup()
  const prepare = vi.fn(async () => {})
  const run = vi.fn(async () => 'committed')
  await expect(
    runAccountOperation(client, { account: 'original', prepare, run }),
  ).resolves.toBe('committed')
  expect(prepare).toHaveBeenCalledOnce()
  expect(run).toHaveBeenCalledOnce()
  client.clear()
})
it('completion guards re-read the live account instead of retaining an earlier account snapshot', () => {
  const { client, switchAccount } = setup()
  const active = accountIsActive(client, 'original')
  expect(active()).toBe(true)
  switchAccount('other')
  expect(active()).toBe(false)
  switchAccount(null)
  expect(active()).toBe(false)
  client.clear()
})
