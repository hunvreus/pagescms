import { queryOptions } from '@tanstack/react-query'

import { getCollection } from '#/client/api/collections'
import { getConfigurationEditor } from '#/client/api/configuration'
import { readEntry, readTranslations } from '#/client/api/entries'
import { readFile } from '#/client/api/fixed-file'
import { readMedia } from '#/client/api/media'

import { queryKeys, queryTimes } from './keys'

interface BranchRef {
  repoId?: string
  source?: string
  owner: string
  repo: string
  branch: string
}

interface NamedBranchResource extends BranchRef {
  name: string
}

export function collectionQueryOptions(
  input: NamedBranchResource & { path?: string; locale?: string },
) {
  return queryOptions({
    queryKey: [
      ...queryKeys.branch(input),
      'collections',
      input.name,
      input.locale ?? '',
      input.path ?? '',
    ] as const,
    queryFn: () => getCollection(input),
    staleTime: queryTimes.directory,
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
    queryFn: () => readEntry(input),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function entryTranslationsQueryOptions(
  input: NamedBranchResource & { path: string },
  accountId?: string,
) {
  return queryOptions({
    queryKey: [
      ...queryKeys.branch(input),
      'entry-translations',
      input.name,
      accountId ?? '',
      input.path,
    ] as const,
    queryFn: () => readTranslations(input),
    enabled: Boolean(accountId),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function configurationEditorQueryOptions(input: BranchRef) {
  return queryOptions({
    queryKey: [...queryKeys.branch(input), 'configuration-editor'] as const,
    queryFn: () => getConfigurationEditor(input),
    staleTime: 30_000,
    gcTime: queryTimes.gc,
  })
}

export function fixedFileQueryOptions(
  input: NamedBranchResource & { locale?: string },
) {
  return queryOptions({
    queryKey: [
      ...queryKeys.branch(input),
      'files',
      input.name,
      input.locale ?? '',
    ] as const,
    queryFn: () => readFile(input),
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
    queryFn: () => readMedia(input),
    staleTime: queryTimes.directory,
    gcTime: queryTimes.gc,
  })
}
