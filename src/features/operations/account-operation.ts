import { authenticationQueryOptions } from '#/queries/session'
import type { QueryClient } from '@tanstack/react-query'

export function accountIsActive(client: QueryClient, account?: string) {
  return () =>
    Boolean(account) &&
    client.getQueryData(authenticationQueryOptions().queryKey)?.user?.id ===
      account
}
export function assertOperationAccount(client: QueryClient, account?: string) {
  if (!accountIsActive(client, account)())
    throw new Error(
      'The signed-in account changed. This operation was not sent.',
    )
}
// Draft persistence may yield before the RPC. Never dispatch that old snapshot
// with the credentials of an account that signed in during the local work.
export async function runAccountOperation<T>(
  client: QueryClient,
  operation: {
    account?: string
    prepare?: () => Promise<void>
    run: () => Promise<T>
  },
) {
  assertOperationAccount(client, operation.account)
  if (operation.prepare) await operation.prepare()
  assertOperationAccount(client, operation.account)
  return operation.run()
}
