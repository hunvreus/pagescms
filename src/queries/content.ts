import { queryOptions } from '@tanstack/react-query'

import { getCollection } from '#/functions/collection'
import { getConfigurationEditor } from '#/functions/configuration-editor'
import { getRawEntry } from '#/functions/entry-editor'
import { getFixedFile } from '#/functions/file-editor'
import { getMedia } from '#/functions/media'

import { queryKeys, queryTimes } from './keys'

interface BranchRef {
  owner: string
  repo: string
  branch: string
}

interface NamedBranchResource extends BranchRef {
  name: string
}

export function collectionQueryOptions(
  input: NamedBranchResource & { path?: string },
) {
  return queryOptions({
    queryKey: [
      ...queryKeys.branch(input),
      'collections',
      input.name,
      input.path ?? '',
    ] as const,
    queryFn: () => getCollection({ data: input }),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function entryQueryOptions(
  input: NamedBranchResource & { path: string },
) {
  return queryOptions({
    queryKey: [
      ...queryKeys.branch(input),
      'entries',
      input.name,
      input.path,
    ] as const,
    queryFn: () => getRawEntry({ data: input }),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function configurationEditorQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'configuration-editor'] as const,
    queryFn: () => getConfigurationEditor({ data: input }),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function fixedFileQueryOptions(input: NamedBranchResource) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'files', input.name] as const,
    queryFn: () => getFixedFile({ data: input }),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function mediaQueryOptions(
  input: NamedBranchResource & { path?: string },
) {
  return queryOptions({
    queryKey: [
      ...queryKeys.branch(input),
      'media',
      input.name,
      input.path ?? '',
    ] as const,
    queryFn: () => getMedia({ data: input }),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}
