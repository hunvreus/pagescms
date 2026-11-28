import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { readReferenceOptions as getReferenceOptions } from '#/client/api/reference'
import { selectedReferenceOptions } from '#/lib/reference-pages'
import { repositoryRequest } from '#/lib/repository-identity'
import { queryKeys, queryTimes } from './keys'

export interface ReferenceQueryInput {
  locale?: string
  owner: string
  repo: string
  repoId?: string
  source?: string
  branch: string
  collection: string
  valueTemplate: string
  labelTemplate: string
  searchFields: string[]
}

function referenceKey(input: ReferenceQueryInput, account: string | undefined) {
  return [
    ...queryKeys.branch(input),
    'references',
    input.collection,
    input.locale ?? '',
    account,
    input.valueTemplate,
    input.labelTemplate,
    input.searchFields,
  ] as const
}

export function referenceSearchPlaceholder<T>(
  previous: T,
  previousKey: readonly unknown[] | undefined,
  queryKey: readonly unknown[],
) {
  return JSON.stringify(previousKey?.slice(0, -1)) ===
    JSON.stringify(queryKey.slice(0, -1))
    ? previous
    : undefined
}

export function referenceOptionsQueryOptions(
  input: ReferenceQueryInput & { query: string },
  account: string | undefined,
) {
  const coordinates = repositoryRequest(input)
  const queryKey = [
    ...referenceKey(coordinates, account),
    'options',
    input.query,
  ] as const
  return infiniteQueryOptions({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getReferenceOptions({
        ...coordinates,
        cursor: pageParam,
        selectedValues: [],
      }),
    getNextPageParam: (page, _pages, _pageParam, pageParams) =>
      page.cursor && !pageParams.includes(page.cursor)
        ? page.cursor
        : undefined,
    // Keep search results while typing, without carrying data across accounts,
    // repositories, branches, collections or different label/value templates.
    placeholderData: (previous, previousQuery) =>
      referenceSearchPlaceholder(previous, previousQuery?.queryKey, queryKey),
    enabled: Boolean(account && input.collection),
    staleTime: queryTimes.directory,
    gcTime: queryTimes.gc,
    retry: false,
  })
}

export function selectedReferencesQueryOptions(
  input: ReferenceQueryInput & { selectedValues: string[] },
  account: string | undefined,
) {
  const coordinates = repositoryRequest(input)
  const selectedValues = [...new Set(input.selectedValues)].sort()
  const key = [...referenceKey(coordinates, account), 'selected'] as const
  return queryOptions({
    queryKey: [...key, selectedValues] as const,
    queryFn: ({ signal, client }) => {
      const cached = client
        .getQueryCache()
        .findAll({ queryKey: key })
        .find((query) => {
          const values = query.queryKey[key.length]
          return (
            query.state.status === 'success' &&
            !query.state.isInvalidated &&
            Date.now() - query.state.dataUpdatedAt < queryTimes.directory &&
            Array.isArray(values) &&
            selectedValues.every((value) => values.includes(value))
          )
        })
      if (cached) {
        const options = cached.state.data as Awaited<
          ReturnType<typeof selectedReferenceOptions>
        >
        return options.filter((option) => selectedValues.includes(option.value))
      }
      return selectedReferenceOptions(
        (cursor) =>
          getReferenceOptions({
            ...coordinates,
            query: '',
            selectedValues,
            cursor,
          }),
        selectedValues,
        () => signal.aborted,
      )
    },
    enabled: Boolean(account && input.collection && selectedValues.length),
    staleTime: queryTimes.directory,
    gcTime: queryTimes.gc,
    retry: false,
  })
}
