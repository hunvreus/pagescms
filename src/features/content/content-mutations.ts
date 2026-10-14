import {
  accountIsActive,
  assertOperationAccount,
  runAccountOperation,
} from '#/features/operations/account-operation'
import { hasPendingPathWrite } from '#/features/operations/pending-write'
import { useMemo } from 'react'
import {
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { authenticationQueryOptions } from '#/queries/session'
import { entryQueryOptions, fixedFileQueryOptions } from '#/queries/content'
import {
  collectionListFields,
  collectionViewModel,
} from '#/features/collections/collection-model'
import { toJsonValue } from '#/lib/json'
import { queryKeys } from '#/queries/keys'
import type { QueryClient } from '@tanstack/react-query'
import type { JsonValue } from '#/lib/json'
import type { getRawEntry } from '#/functions/entry-editor'
import type { getCollection } from '#/functions/collection'

export interface ContentCoordinates {
  owner: string
  repo: string
  branch: string
  name: string
  path?: string
}
export type ContentKind = 'save' | 'create' | 'rename' | 'delete'
export interface ContentJob<T> {
  id: string
  account?: string
  expectedAccount?: string
  prepare?: () => Promise<void>
  coordinates: ContentCoordinates
  kind: ContentKind
  title: string
  parent?: string
  filename?: string
  destination?: string
  fields?: JsonValue
  run: () => Promise<T>
  confirmed: (result: T, isActiveAccount: () => boolean) => Promise<void> | void
  retain?: () => () => void
}
const mutationKey = ['pagescms', 'content-mutations'] as const
export function sameContent(a: ContentCoordinates, b: ContentCoordinates) {
  return sameBranch(a, b) && a.name === b.name
}
function sameBranch(a: ContentCoordinates, b: ContentCoordinates) {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.repo.toLowerCase() === b.repo.toLowerCase() &&
    a.branch === b.branch
  )
}
export function useContentJobs(
  coordinates: ContentCoordinates,
  allNames = false,
) {
  const client = useQueryClient()
  const account = client.getQueryData(authenticationQueryOptions().queryKey)
    ?.user?.id
  const entries = useMutationState({
    filters: { mutationKey },
    select: (mutation) => ({
      job: mutation.state.variables as ContentJob<unknown> | undefined,
      status: mutation.state.status,
      error: mutation.state.error,
      at: mutation.state.submittedAt,
    }),
  })
  return useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.job &&
          entry.job.account === account &&
          (allNames
            ? sameBranch(entry.job.coordinates, coordinates)
            : sameContent(entry.job.coordinates, coordinates)),
      ),
    [
      entries,
      account,
      coordinates.owner,
      coordinates.repo,
      coordinates.branch,
      coordinates.name,
      allNames,
    ],
  )
}
export function useContentActivity(
  coordinates: ContentCoordinates,
  id?: string,
) {
  const jobs = useContentJobs(coordinates, Boolean(coordinates.path)).filter(
    (entry) =>
      coordinates.path
        ? entry.job?.coordinates.path === coordinates.path ||
          entry.job?.destination === coordinates.path
        : entry.job?.id === id,
  )
  const latest = jobs.at(-1)
  return {
    pending: jobs.some((entry) => entry.status === 'pending'),
    error: latest?.status === 'error' ? latest.error : null,
    kind: latest?.job?.kind,
  }
}

export function hasPendingContentWrite(
  client: QueryClient,
  coordinates: ContentCoordinates,
  id: string,
  account: string,
  destination?: string,
) {
  const paths = [coordinates.path, destination].filter((path): path is string =>
    Boolean(path),
  )
  if (hasPendingPathWrite(client, account, coordinates, paths)) return true
  return client
    .getMutationCache()
    .findAll({ mutationKey, status: 'pending' })
    .some((entry) => {
      const pending = entry.state.variables as ContentJob<unknown> | undefined
      return (
        pending?.account === account &&
        sameBranch(pending.coordinates, coordinates) &&
        (paths.length
          ? paths.some(
              (path) =>
                pending.coordinates.path === path ||
                pending.destination === path,
            )
          : pending.id === id)
      )
    })
}

export function useContentMutation<T>() {
  const client = useQueryClient()
  const mutation = useMutation<T, unknown, ContentJob<T>>({
    mutationKey,
    retry: false,
    onMutate: async (job) => {
      if (job.coordinates.path) {
        await client.cancelQueries({
          queryKey: entryQueryOptions({
            ...job.coordinates,
            path: job.coordinates.path,
          }).queryKey,
          exact: true,
        })
        await client.cancelQueries({
          queryKey: fixedFileQueryOptions(job.coordinates).queryKey,
          exact: true,
        })
      }
    },
    mutationFn: (job) => runAccountOperation(client, job),
    onSuccess: async (result, job) => {
      if (
        job.kind === 'create' &&
        typeof result === 'object' &&
        result &&
        'path' in result &&
        typeof result.path === 'string'
      )
        job.destination = result.path
      // Options-level callbacks are owned by the Mutation, not the mounted view.
      try {
        await job.confirmed(result, accountIsActive(client, job.account))
      } catch (error) {
        console.warn(
          'Content was committed but local acknowledgement failed',
          error,
        )
        if (accountIsActive(client, job.account)())
          toast.error(
            'The file operation completed, but local recovery data could not be updated.',
          )
      }
      if (
        client.getQueryData(authenticationQueryOptions().queryKey)?.user?.id ===
        job.account
      ) {
        toast.success(
          {
            save: 'File saved',
            create: 'File created',
            rename: 'File renamed',
            delete: 'File deleted',
          }[job.kind],
        )
      }
    },
    onSettled: (_result, _error, job) => {
      job.fields = undefined
      job.prepare = undefined
      job.retain = undefined
      job.run = async () => {
        throw new Error('Completed content operations cannot be replayed.')
      }
      job.confirmed = () => {}
    },
    onError: (_error, job) => {
      if (
        client.getQueryData(authenticationQueryOptions().queryKey)?.user?.id ===
        job.account
      )
        toast.error(
          'Could not complete the file operation. Your local draft is retained.',
        )
    },
  })
  async function run(job: Omit<ContentJob<T>, 'account'>) {
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    if (!account) throw new Error('Sign in before modifying content.')
    assertOperationAccount(client, job.expectedAccount ?? account)
    const active = hasPendingContentWrite(
      client,
      job.coordinates,
      job.id,
      account,
      job.destination,
    )
    if (active) {
      const error = new Error('This file already has an operation in progress.')
      toast.error(error.message)
      throw error
    }
    const release = job.retain?.()
    try {
      return await mutation.mutateAsync({ ...job, account })
    } finally {
      release?.()
    }
  }
  return { run, error: mutation.error, pending: mutation.isPending }
}

type EntryData = Awaited<ReturnType<typeof getRawEntry>>
type CollectionData = Awaited<ReturnType<typeof getCollection>>
export function confirmContentWrite(
  client: QueryClient,
  coordinates: ContentCoordinates,
  result: { path: string; entry?: EntryData },
) {
  if (result.entry) {
    confirmEntry(client, coordinates, result.entry)
  } else {
    // A write-only grant confirms the write, but does not permit seeding reader
    // data. Reopening must pass the normal read authorization again.
    client.removeQueries({
      queryKey: entryQueryOptions({ ...coordinates, path: result.path })
        .queryKey,
      exact: true,
    })
    client.removeQueries({
      queryKey: fixedFileQueryOptions(coordinates).queryKey,
      exact: true,
    })
  }
}

export function confirmEntry(
  client: QueryClient,
  coordinates: ContentCoordinates,
  entry: EntryData,
) {
  client.setQueryData(
    entryQueryOptions({ ...coordinates, path: entry.path }).queryKey,
    entry,
  )
  if (entry.schemaType === 'file')
    client.setQueryData(fixedFileQueryOptions(coordinates).queryKey, entry)
  const collections = client.getQueriesData<CollectionData>({
    queryKey: [
      ...queryKeys.branch(coordinates),
      'collections',
      coordinates.name,
    ],
  })
  for (const [key, data] of collections) {
    if (!data) continue
    const parent = entry.path.split('/').slice(0, -1).join('/')
    const model = collectionViewModel({
      fields: data.collection.fields,
      filename: data.collection.filename,
      view: data.collection.view,
    })
    const row: CollectionData['contents'][number] = {
      type: 'file',
      path: entry.path,
      name: entry.filename,
      parentPath: parent,
      sha: entry.sha,
      isNode: data.contents.some(
        (item) =>
          item.type === 'file' && item.path === entry.path && item.isNode,
      ),
      fields:
        entry.mode === 'raw'
          ? { name: entry.filename }
          : toJsonValue(collectionListFields(entry.content, model)),
    }
    client.setQueryData<CollectionData>(key, {
      ...data,
      contents: data.contents.some((item) => item.path === entry.path)
        ? data.contents.map((item) => (item.path === entry.path ? row : item))
        : parent === data.collection.path
          ? [...data.contents, row]
          : data.contents,
    })
  }
}
export function refreshContent(
  client: QueryClient,
  coordinates: ContentCoordinates,
) {
  // The exact entry is already confirmed. Reconcile lists/history without making
  // their requests part of the mutation's success or blocking unrelated views.
  void client
    .invalidateQueries({
      queryKey: [
        ...queryKeys.branch(coordinates),
        'collections',
        coordinates.name,
      ],
    })
    .catch(() => {})
}
export function removeEntryCache(
  client: QueryClient,
  coordinates: ContentCoordinates & { path: string },
) {
  client.removeQueries({
    queryKey: entryQueryOptions(coordinates).queryKey,
    exact: true,
  })
  for (const [key, data] of client.getQueriesData<CollectionData>({
    queryKey: [
      ...queryKeys.branch(coordinates),
      'collections',
      coordinates.name,
    ],
  })) {
    if (data)
      client.setQueryData<CollectionData>(key, {
        ...data,
        contents: data.contents.filter(
          (entry) => entry.path !== coordinates.path,
        ),
      })
  }
}

export function optimisticRows(
  rows: CollectionData['contents'],
  jobs: ContentJob<unknown>[],
  directory: string,
  model: ReturnType<typeof collectionViewModel>,
) {
  let result = rows
  for (const job of jobs) {
    if (job.kind === 'delete')
      result = result.filter((row) => row.path !== job.coordinates.path)
    if (job.kind === 'rename')
      result = result.map((row) =>
        row.path === job.coordinates.path
          ? {
              ...row,
              name: job.filename ?? row.name,
              ...(row.type === 'file' &&
              typeof row.fields === 'object' &&
              row.fields &&
              !Array.isArray(row.fields)
                ? { fields: { ...row.fields, name: job.filename ?? row.name } }
                : {}),
            }
          : row,
      )
    if (job.kind === 'save' && job.fields)
      result = result.map((row) =>
        row.path === job.coordinates.path && row.type === 'file'
          ? {
              ...row,
              fields: toJsonValue(collectionListFields(job.fields, model)),
            }
          : row,
      )
    if (
      job.kind === 'create' &&
      job.parent === directory &&
      !result.some((row) => row.path === job.destination)
    )
      result = [
        ...result,
        {
          type: 'file',
          path: `__creating__/${job.id}`,
          name: job.title,
          parentPath: directory,
          sha: null,
          isNode: false,
          fields: job.fields
            ? toJsonValue(collectionListFields(job.fields, model))
            : { name: job.title },
        },
      ]
  }
  return result
}
