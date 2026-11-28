import { useLingui as useUiMessages } from '@lingui/react/macro'
import { parseLocalizedPath } from '#/lib/i18n'
import { projectLocale } from '#/lib/i18n-values'
import { fieldValidationIssues } from '#/shared/field-validation-error'
import {
  repositoryRequest,
  repositoryIdentityKey,
} from '#/lib/repository-identity'
import {
  accountIsActive,
  assertOperationAccount,
  runAccountOperation,
} from '#/features/pending-writes/account-operation'
import { hasPendingPathWrite } from '#/features/pending-writes/pending-write'
import { useMemo } from 'react'
import {
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query'
import {
  toast,
  notifyError,
  withErrorNotification,
  OperationAcknowledgementError,
} from '#/lib/notifications'
import { authenticationQueryOptions } from '#/client/queries/session'
import {
  entryQueryOptions,
  fixedFileQueryOptions,
} from '#/client/queries/content'
import {
  collectionListFields,
  collectionViewModel,
} from '#/features/collections/collection-model'
import { toJsonValue } from '#/shared/json'
import { queryKeys } from '#/client/queries/keys'
import { invalidateActivity } from '#/features/activity/activity-query'
import { isContentConflict } from '#/shared/content-conflict'
import type { QueryClient } from '@tanstack/react-query'
import type { JsonValue } from '#/shared/json'
import type { readRawEntry as getRawEntry } from '#/server/services/content'
import type { getCollection } from '#/client/api/collections'

export interface ContentCoordinates {
  repoId?: string
  source?: string
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
  locale?: string
  title: string
  parent?: string
  filename?: string
  destination?: string
  fields?: JsonValue
  run: () => Promise<T>
  confirmed: (result: T, isActiveAccount: () => boolean) => Promise<void> | void
  retain?: () => () => void
  handledError?: (error: unknown) => boolean
}
const mutationKey = ['pagescms', 'content-mutations'] as const
export function sameContent(a: ContentCoordinates, b: ContentCoordinates) {
  return sameBranch(a, b) && a.name === b.name
}
function sameBranch(a: ContentCoordinates, b: ContentCoordinates) {
  return (
    repositoryIdentityKey(a) === repositoryIdentityKey(b) &&
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
  const { t: _t } = useUiMessages()

  const client = useQueryClient()
  const mutation = useMutation<T, unknown, ContentJob<T>>({
    mutationKey,
    retry: false,
    networkMode: 'always',
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
          queryKey: [
            ...queryKeys.branch(job.coordinates),
            'files',
            job.coordinates.name,
          ],
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
      let acknowledged = true
      // Options-level callbacks are owned by the Mutation, not the mounted view.
      try {
        await job.confirmed(result, accountIsActive(client, job.account))
      } catch (error) {
        acknowledged = false
        console.warn(
          'Content was committed but local acknowledgement failed',
          error,
        )
        if (accountIsActive(client, job.account)())
          notifyError(
            error instanceof OperationAcknowledgementError
              ? error
              : new OperationAcknowledgementError(error),
            _t({
              message:
                'The file operation completed, but local recovery data could not be updated.',
            }),
          )
      }
      if (
        client.getQueryData(authenticationQueryOptions().queryKey)?.user?.id ===
        job.account
      ) {
        invalidateActivity(client, job.coordinates)
        if (acknowledged)
          toast.success(
            {
              save: _t({ message: 'File saved' }),
              create: _t({ message: 'File created' }),
              rename: _t({ message: 'File renamed' }),
              delete: _t({ message: 'File deleted' }),
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
  })
  async function run(job: Omit<ContentJob<T>, 'account'>) {
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    const handledError = job.handledError
    return withErrorNotification(
      async () => {
        job = { ...job, coordinates: repositoryRequest(job.coordinates) }
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
          const error = new Error(
            'This file already has an operation in progress.',
          )
          throw error
        }
        const release = job.retain?.()
        try {
          return await mutation.mutateAsync({ ...job, account })
        } finally {
          release?.()
        }
      },
      _t({
        message:
          'Could not complete the file operation. Your local draft is retained.',
      }),
      {
        active: account ? accountIsActive(client, account) : () => true,
        handled: (error) =>
          handledError?.(error) ||
          (job.kind === 'save' &&
            (isContentConflict(error) ||
              Boolean(fieldValidationIssues(error)))) ||
          (job.kind === 'create' && Boolean(fieldValidationIssues(error))),
      },
    )
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
      queryKey: [...queryKeys.branch(coordinates), 'files', coordinates.name],
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
  if (entry.schemaType === 'file') {
    // Locale aliases may share a file, but separate translations never share data.
    for (const [key, cached] of client.getQueriesData<EntryData>({
      queryKey: [...queryKeys.branch(coordinates), 'files', coordinates.name],
    })) {
      if (cached?.path === entry.path) client.setQueryData(key, entry)
    }
    if (!entry.i18n)
      client.setQueryData(fixedFileQueryOptions(coordinates).queryKey, entry)
  }
  const collections = client.getQueriesData<CollectionData>({
    queryKey: [
      ...queryKeys.branch(coordinates),
      'collections',
      coordinates.name,
    ],
  })
  for (const [key, data] of collections) {
    if (!data) continue
    const schema = {
      ...data.collection,
      type: 'collection',
      path: data.collection.rootPath,
    }
    const translation =
      data.collection.i18n?.scheme === 'files'
        ? parseLocalizedPath(schema, entry.path)
        : undefined
    if (
      data.collection.i18n?.scheme === 'files' &&
      translation?.locale !== data.collection.locale
    )
      continue
    const parent = (translation?.canonical ?? entry.path)
      .split('/')
      .slice(0, -1)
      .join('/')
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
      ...(translation ? { locale: translation.locale } : {}),
      isNode: data.contents.some(
        (item) =>
          item.type === 'file' && item.path === entry.path && item.isNode,
      ),
      fields:
        entry.mode === 'raw'
          ? { name: entry.filename }
          : toJsonValue(
              collectionListFields(
                data.collection.i18n?.scheme === 'fields'
                  ? projectLocale(
                      schema,
                      entry.content,
                      data.collection.locale ?? data.collection.i18n.default,
                    )
                  : entry.content,
                model,
              ),
            ),
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
  void client
    .invalidateQueries({
      queryKey: [
        ...queryKeys.branch(coordinates),
        'entry-translations',
        coordinates.name,
      ],
    })
    .catch(() => {})
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
  void client
    .invalidateQueries({
      queryKey: [
        ...queryKeys.branch(coordinates),
        'references',
        coordinates.name,
      ],
    })
    .catch(() => {})
  void client
    .invalidateQueries({
      queryKey: [...queryKeys.branch(coordinates), 'file-history'],
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
  collection?: CollectionData['collection'],
) {
  const listFields = (content: JsonValue) =>
    collectionListFields(
      collection?.i18n?.scheme === 'fields'
        ? projectLocale(
            collection,
            content,
            collection.locale ?? collection.i18n.default,
          )
        : content,
      model,
    )
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
              fields: toJsonValue(listFields(job.fields!)),
            }
          : row,
      )
    if (
      job.kind === 'create' &&
      (collection?.i18n?.scheme !== 'files' ||
        job.locale === (collection.locale ?? collection.i18n.default)) &&
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
          ...(job.locale ? { locale: job.locale } : {}),
          fields: job.fields
            ? toJsonValue(listFields(job.fields))
            : { name: job.title },
        },
      ]
  }
  return result
}
