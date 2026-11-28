import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/client/queries/session'
import {
  referenceOptionsQueryOptions,
  selectedReferencesQueryOptions,
} from '#/client/queries/references'
import type { ReferenceQueryInput } from '#/client/queries/references'

export function useReferenceOptions(
  input: ReferenceQueryInput & { selectedValues: string[] },
) {
  const { data: auth } = useQuery(authenticationQueryOptions())
  const account = auth?.user?.id
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 200)
    return () => window.clearTimeout(timer)
  }, [search])
  const options = useInfiniteQuery(
    referenceOptionsQueryOptions({ ...input, query }, account),
  )
  const selected = useQuery(selectedReferencesQueryOptions(input, account))
  const values = new Map(
    (options.data?.pages.flatMap((page) => page.options) ?? []).map(
      (option) => [option.value, option],
    ),
  )
  for (const option of selected.data ?? []) values.set(option.value, option)
  return {
    options: [...values.values()],
    loading: options.isFetching || search !== query,
    error: options.error ?? selected.error,
    retry: () => {
      void options.refetch()
      void selected.refetch()
    },
    onSearch: setSearch,
    onLoadMore:
      options.hasNextPage && !options.isPlaceholderData && search === query
        ? () => {
            if (!options.isFetching) void options.fetchNextPage()
          }
        : undefined,
  }
}
