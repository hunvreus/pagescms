import { QueryClient } from '@tanstack/react-query'
import { bindApiAccount } from '#/client/api/index'
import { queryKeys } from '#/client/queries/keys'
import type { AuthenticationState } from '#/lib/authentication'

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { networkMode: 'always', retry: false },
      queries: {
        gcTime: 5 * 60 * 1000,
        staleTime: 30 * 1000,
      },
    },
  })

  bindApiAccount(
    () =>
      queryClient.getQueryData<AuthenticationState>(queryKeys.session())?.user
        ?.id,
  )

  return {
    queryClient,
  }
}
