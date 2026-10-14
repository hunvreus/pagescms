import {
  accountIsActive,
  runAccountOperation,
} from '#/features/operations/account-operation'
import { hasPendingPathWrite } from '#/features/operations/pending-write'
import { useMemo } from 'react'
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { authenticationQueryOptions } from '#/queries/session'
import { queryKeys } from '#/queries/keys'
import { mediaQueryOptions } from '#/queries/content'
import type { QueryClient } from '@tanstack/react-query'
import type { MediaCoordinates } from './media-browser'
import type { MediaDirectoryData, MediaEntry } from './media-model'

export interface MediaJob<T = unknown> {
  id: string
  account?: string
  coordinates: MediaCoordinates
  kind: 'upload' | 'folder' | 'rename' | 'move' | 'delete'
  paths: string[]
  directory: string
  entry?: MediaEntry
  destination?: string
  filename?: string
  files?: File[]
  run: () => Promise<T>
  confirmed?: (result: T, isActive: () => boolean) => void | Promise<void>
}
const emptyProgress: Partial<Record<string, number[]>> = {}
const key = ['pagescms', 'media-mutations'] as const
const sameBranch = (a: MediaCoordinates, b: MediaCoordinates) =>
  a.owner.toLowerCase() === b.owner.toLowerCase() &&
  a.repo.toLowerCase() === b.repo.toLowerCase() &&
  a.branch === b.branch
const progressKey = (account?: string) =>
  ['pagescms', 'media-upload-progress', account] as const
export function mediaParent(path: string) {
  return path.split('/').slice(0, -1).join('/')
}
export function useMediaJobs(coordinates: MediaCoordinates) {
  const client = useQueryClient()
  const account = client.getQueryData(authenticationQueryOptions().queryKey)
    ?.user?.id
  const mutations = useMutationState({
    filters: { mutationKey: key },
    select: (mutation) => ({
      job: mutation.state.variables as MediaJob | undefined,
      status: mutation.state.status,
      error: mutation.state.error,
    }),
  })
  const { data: completed = emptyProgress } = useQuery<
    Partial<Record<string, number[]>>
  >({
    queryKey: progressKey(account),
    queryFn: async () => ({}),
    enabled: false,
  })
  const jobs = useMemo(
    () =>
      mutations.filter(
        (item) =>
          item.job?.account === account &&
          item.job &&
          sameBranch(item.job.coordinates, coordinates) &&
          item.job.coordinates.name === coordinates.name,
      ),
    [
      mutations,
      account,
      coordinates.owner,
      coordinates.repo,
      coordinates.branch,
      coordinates.name,
    ],
  )
  return { jobs, completed }
}
export function completeMediaUpload(
  client: QueryClient,
  account: string,
  id: string,
  index: number,
) {
  client.setQueryData<Partial<Record<string, number[]>>>(
    progressKey(account),
    (current) => ({ ...current, [id]: [...(current?.[id] ?? []), index] }),
  )
}
export function mediaRows(
  entries: MediaEntry[],
  jobs: MediaJob[],
  directory: string,
  completed: Partial<Record<string, number[]>>,
) {
  let rows = entries
  for (const job of jobs) {
    if (job.kind === 'delete' || job.kind === 'move')
      rows = rows.filter((entry) => entry.path !== job.entry?.path)
    if (job.kind === 'rename')
      rows = rows.map((entry) =>
        entry.path === job.entry?.path
          ? { ...entry, name: job.filename ?? entry.name }
          : entry,
      )
    if (job.directory !== directory) continue
    if (
      job.kind === 'folder' &&
      !rows.some((row) => row.path === job.destination)
    )
      rows = [
        ...rows,
        {
          id: `__pending__/${job.id}`,
          path: `__pending__/${job.id}`,
          type: 'dir',
          name: job.filename ?? '',
          sha: null,
          size: null,
          contentType: null,
        },
      ]
    if (job.kind === 'upload')
      rows = [
        ...rows,
        ...(job.files ?? []).flatMap((file, index) =>
          completed[job.id]?.includes(index)
            ? []
            : [
                {
                  id: `__pending__/${job.id}/${index}`,
                  path: `__pending__/${job.id}/${index}`,
                  type: 'file' as const,
                  name: file.name,
                  sha: null,
                  size: file.size,
                  contentType: file.type,
                },
              ],
        ),
      ]
  }
  return rows
}
export function patchMedia(
  client: QueryClient,
  coordinates: MediaCoordinates,
  removed: string[],
  added?: MediaEntry,
) {
  for (const [queryKey, data] of client.getQueriesData<MediaDirectoryData>({
    queryKey: queryKeys.media(coordinates),
  })) {
    if (!data) continue
    const entries = data.entries.filter(
      (entry) => !removed.includes(entry.path) && entry.path !== added?.path,
    )
    if (added && data.media.path === mediaParent(added.path))
      entries.push(added)
    client.setQueryData<MediaDirectoryData>(queryKey, { ...data, entries })
  }
}
export function refreshMedia(
  client: QueryClient,
  coordinates: MediaCoordinates,
  directories: string[],
) {
  const account = client.getQueryData(authenticationQueryOptions().queryKey)
    ?.user?.id
  for (const [queryKey, data] of client.getQueriesData<MediaDirectoryData>({
    queryKey: queryKeys.media(coordinates),
  })) {
    const path = data?.media.path ?? queryKey.at(-1)
    if (
      path !== '' &&
      (typeof path !== 'string' || !directories.includes(path))
    )
      continue
    const query = client.getQueryCache().find({ queryKey, exact: true })
    const invalidate = () => {
      if (
        client.getQueryData(authenticationQueryOptions().queryKey)?.user?.id !==
          account ||
        client.getQueryCache().find({ queryKey, exact: true }) !== query
      )
        return
      void client.invalidateQueries({ queryKey, exact: true }).catch(() => {})
    }
    // A first directory read can have started before the move/upload committed.
    // Query doesn't replace an in-flight first fetch, so refresh once it settles.
    if (!data && query?.promise) void query.promise.then(invalidate, invalidate)
    else invalidate()
  }
  for (const [queryKey] of client.getQueriesData({
    queryKey: queryKeys.mediaDelivery(coordinates),
  })) {
    const path = queryKey.at(-1)
    if (typeof path !== 'string') continue
    const manifest = client.getQueryData(
      mediaQueryOptions({ ...coordinates, path: path || undefined }).queryKey,
    )
    if (!directories.includes(manifest?.media.path ?? path)) continue
    void client.invalidateQueries({ queryKey, exact: true }).catch(() => {})
  }
}
export function useMediaMutation<T>() {
  const client = useQueryClient()
  const mutation = useMutation<T, unknown, MediaJob<T>>({
    mutationKey: key,
    retry: false,
    mutationFn: (job) => runAccountOperation(client, job),
    onSuccess: async (result, job) => {
      const active = accountIsActive(client, job.account)
      try {
        await job.confirmed?.(result, active)
      } catch (error) {
        console.warn('Media committed but local update failed', error)
        if (active())
          toast.error(
            'The media operation completed, but its local view could not be updated.',
          )
      }
      if (active() && job.kind !== 'upload')
        toast.success(
          {
            folder: 'Folder created',
            rename: 'File renamed',
            move: 'File moved',
            delete: 'File deleted',
          }[job.kind],
        )
    },
    onError: (_error, job) => {
      if (
        job.kind !== 'upload' &&
        client.getQueryData(authenticationQueryOptions().queryKey)?.user?.id ===
          job.account
      )
        toast.error('Could not complete the media operation.')
    },
    onSettled: (_result, _error, job) => {
      job.files = undefined
      job.run = async () => {
        throw new Error('Completed media operations cannot be replayed.')
      }
      job.confirmed = undefined
      setTimeout(
        () =>
          client.setQueryData<Partial<Record<string, number[]>>>(
            progressKey(job.account),
            (current) => {
              if (!current) return current
              const next = { ...current }
              delete next[job.id]
              return next
            },
          ),
        0,
      )
    },
  })
  async function run(job: Omit<MediaJob<T>, 'account'>) {
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    if (!account) throw new Error('Sign in before modifying media.')
    const busy = hasPendingPathWrite(
      client,
      account,
      job.coordinates,
      job.paths,
    )
    if (busy) {
      const error = new Error(
        'This media item already has an operation in progress.',
      )
      toast.error(error.message)
      throw error
    }
    return mutation.mutateAsync({ ...job, account })
  }
  return { run }
}
