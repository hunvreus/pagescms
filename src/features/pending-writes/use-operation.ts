import { useLingui as useUiMessages } from '@lingui/react/macro'
import { repositoryIdentityKey } from '#/lib/repository-identity'
import {
  accountIsActive,
  assertOperationAccount,
  runAccountOperation,
} from './account-operation'
import { hasPendingPathWrite } from './pending-write'
import {
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query'
import {
  toast,
  OperationAcknowledgementError,
  withErrorNotification,
} from '#/lib/notifications'
import { authenticationQueryOptions } from '#/client/queries/session'
import { invalidateActivity } from '#/features/activity/activity-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

export interface Operation<T> {
  lock: string
  coordinates?: { owner: string; repo: string; branch: string }
  paths?: string[]
  account?: string
  expectedAccount?: string
  prepare?: () => Promise<void>
  run: () => Promise<T>
  confirmed?: (
    result: T,
    isActiveAccount: () => boolean,
  ) => void | Promise<void>
  retain?: () => () => void
  failureMessage?: string
  successMessage?: string | ((result: T) => string)
  handledError?: (error: unknown) => boolean
}
const key = ['pagescms', 'operations'] as const
export function refreshQueries(client: QueryClient, keys: QueryKey[]) {
  for (const queryKey of keys)
    void client.invalidateQueries({ queryKey }).catch(() => {})
}
export function useOperation<T>(lock: string) {
  const { t: _t } = useUiMessages()

  const client = useQueryClient()
  const account = client.getQueryData(authenticationQueryOptions().queryKey)
    ?.user?.id
  const states = useMutationState({
    filters: { mutationKey: key },
    select: (mutation) => ({
      operation: mutation.state.variables as Operation<unknown> | undefined,
      status: mutation.state.status,
      error: mutation.state.error,
    }),
  }).filter(
    (item) =>
      item.operation?.account === account && item.operation?.lock === lock,
  )
  const mutation = useMutation<T, unknown, Operation<T>>({
    mutationKey: key,
    retry: false,
    networkMode: 'always',
    mutationFn: (operation) => runAccountOperation(client, operation),
    onSuccess: async (result, operation) => {
      const active = accountIsActive(client, operation.account)
      if (active() && operation.coordinates)
        invalidateActivity(client, operation.coordinates)
      try {
        await operation.confirmed?.(result, active)
      } catch (error) {
        console.warn('Operation confirmed but local update failed', error)
        throw error instanceof OperationAcknowledgementError
          ? error
          : new OperationAcknowledgementError(error)
      }
      if (active() && operation.successMessage)
        toast.success(
          typeof operation.successMessage === 'function'
            ? operation.successMessage(result)
            : operation.successMessage,
        )
    },
    onSettled: (_result, _error, operation) => {
      operation.run = async () => {
        throw new Error('Completed operations cannot be replayed.')
      }
      operation.confirmed = undefined
      operation.retain = undefined
      operation.prepare = undefined
      operation.handledError = undefined
      operation.successMessage = undefined
    },
  })
  async function run(operation: Omit<Operation<T>, 'lock' | 'account'>) {
    const owner = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    const handled = operation.handledError
    return withErrorNotification(
      async () => {
        if (!owner) throw new Error('Sign in before running this operation.')
        assertOperationAccount(client, operation.expectedAccount ?? owner)
        const pending = client
          .getMutationCache()
          .findAll({ mutationKey: key, status: 'pending' })
          .some((item) => {
            const job = item.state.variables as Operation<unknown> | undefined
            return job?.account === owner && job.lock === lock
          })
        if (
          operation.coordinates &&
          hasPendingPathWrite(
            client,
            owner,
            operation.coordinates,
            operation.paths ?? [],
          )
        )
          throw new Error('This file already has an operation in progress.')
        if (pending) throw new Error('This operation is already in progress.')
        const release = operation.retain?.()
        try {
          return await mutation.mutateAsync({
            ...operation,
            lock,
            account: owner,
          })
        } finally {
          release?.()
        }
      },
      operation.failureMessage ?? 'Could not complete the operation.',
      {
        active: owner ? accountIsActive(client, owner) : () => true,
        handled,
      },
    )
  }
  return {
    run,
    pending: states.some((item) => item.status === 'pending'),
    error: states.at(-1)?.status === 'error' ? states.at(-1)?.error : null,
  }
}
export function operationKey(
  kind: string,
  coordinates: { owner: string; repo: string; branch?: string },
  resource?: string,
) {
  return JSON.stringify([
    kind,
    repositoryIdentityKey(coordinates),
    coordinates.branch ?? null,
    resource ?? null,
  ])
}
