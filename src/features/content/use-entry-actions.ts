import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { deleteEntry, renameEntry } from '#/functions/entry-editor'
import { authenticationQueryOptions } from '#/queries/session'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { entryQueryOptions } from '#/queries/content'
import {
  contentDraftKey,
  deleteEntryDraft,
  readDraft,
  relocateEntryDraft,
} from '#/features/drafts/draft-store'
import {
  refreshContent,
  removeEntryCache,
  useContentMutation,
} from './content-mutations'
import type { ContentCoordinates } from './content-mutations'
import type { getRawEntry } from '#/functions/entry-editor'
import type { getCollection } from '#/functions/collection'
import type { DraftSession } from '#/features/drafts/draft-session'
import { queryKeys } from '#/queries/keys'

type FileCoordinates = ContentCoordinates & { path: string }
export function useEntryActions() {
  const client = useQueryClient()
  const router = useRouter()
  const removal = useContentMutation<Awaited<ReturnType<typeof deleteEntry>>>()
  const rename = useContentMutation<Awaited<ReturnType<typeof renameEntry>>>()
  function key(coordinates: FileCoordinates) {
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    const workspace = client.getQueryData(
      repositoryWorkspaceQueryOptions(coordinates).queryKey,
    )
    return account && workspace
      ? contentDraftKey(account, workspace.source, coordinates)
      : undefined
  }
  async function remove(
    coordinates: FileCoordinates,
    sha: string,
    href?: string,
    draft?: Pick<
      DraftSession<unknown>,
      'flush' | 'retain' | 'detach' | 'localError'
    >,
  ) {
    const origin = router.state.location.href
    const draftKey = key(coordinates)
    let revision = 0
    return removal.run({
      id: draftKey ?? coordinates.path,
      coordinates,
      kind: 'delete',
      title: coordinates.path,
      retain: draft ? () => draft.retain() : undefined,
      prepare: async () => {
        await draft?.flush()
        if (draftKey) revision = (await readDraft(draftKey))?.revision ?? 0
      },
      run: () => deleteEntry({ data: { ...coordinates, sha } }),
      confirmed: async (_result, isActiveAccount) => {
        draft?.detach()
        if (draftKey) {
          try {
            await deleteEntryDraft(draftKey, revision)
          } catch (error) {
            draft?.localError(error)
            if (isActiveAccount())
              toast.error(
                'File deleted. A newer local draft was retained for download.',
              )
          }
        }
        if (isActiveAccount()) {
          if (href && router.state.location.href === origin)
            await router.navigate({ href })
          if (!isActiveAccount()) return
          removeEntryCache(client, coordinates)
          refreshContent(client, coordinates)
        }
      },
    })
  }
  async function changeName(
    coordinates: FileCoordinates,
    sha: string,
    filename: string,
    hrefBase?: string,
    draft?: Pick<
      DraftSession<unknown>,
      'flush' | 'retain' | 'detach' | 'localError'
    >,
  ) {
    const origin = router.state.location.href
    const draftKey = key(coordinates)
    const destination = [
      ...coordinates.path.split('/').slice(0, -1),
      filename.trim(),
    ].join('/')
    let revision = 0
    let draftMoved = true
    return rename.run({
      id: draftKey ?? coordinates.path,
      coordinates,
      destination,
      filename: filename.trim(),
      kind: 'rename',
      title: coordinates.path,
      retain: draft ? () => draft.retain() : undefined,
      prepare: async () => {
        await draft?.flush()
        if (draftKey) {
          revision = (await readDraft(draftKey))?.revision ?? 0
          const parts = JSON.parse(draftKey) as unknown[]
          parts[6] = destination
          if (await readDraft(JSON.stringify(parts)))
            throw new Error(
              'The destination already has a local draft. Keep or discard it before renaming.',
            )
        }
      },
      run: () => renameEntry({ data: { ...coordinates, sha, filename } }),
      confirmed: async (result, isActiveAccount) => {
        if (draftKey) {
          try {
            await relocateEntryDraft(
              draftKey,
              revision,
              result.newPath,
              result.sha,
            )
            draft?.detach()
          } catch (error) {
            draft?.localError(error)
            if (isActiveAccount())
              toast.error(
                'File renamed. Its local draft could not be moved and is retained for download.',
              )
            draftMoved = false
            draft?.detach()
          }
        }
        if (!isActiveAccount()) return
        const old = client.getQueryData(entryQueryOptions(coordinates).queryKey)
        if (old)
          client.setQueryData<Awaited<ReturnType<typeof getRawEntry>>>(
            entryQueryOptions({ ...coordinates, path: result.newPath })
              .queryKey,
            {
              ...old,
              path: result.newPath,
              filename: result.newPath.split('/').at(-1)!,
              sha: result.sha,
            },
          )
        for (const [queryKey, collection] of client.getQueriesData<
          Awaited<ReturnType<typeof getCollection>>
        >({
          queryKey: [
            ...queryKeys.branch(coordinates),
            'collections',
            coordinates.name,
          ],
        })) {
          if (collection)
            client.setQueryData(queryKey, {
              ...collection,
              contents: collection.contents.map((entry) =>
                entry.type === 'file' && entry.path === coordinates.path
                  ? {
                      ...entry,
                      path: result.newPath,
                      name: result.newPath.split('/').at(-1)!,
                      fields:
                        typeof entry.fields === 'object' &&
                        entry.fields &&
                        !Array.isArray(entry.fields)
                          ? {
                              ...entry.fields,
                              name: result.newPath.split('/').at(-1)!,
                            }
                          : entry.fields,
                      sha: result.sha,
                    }
                  : entry,
              ),
            })
        }
        if (draftMoved && hrefBase && router.state.location.href === origin)
          await router.navigate({
            href: `${hrefBase}/${result.newPath.split('/').map(encodeURIComponent).join('/')}`,
          })
        if (!isActiveAccount()) return
        client.removeQueries({
          queryKey: entryQueryOptions(coordinates).queryKey,
          exact: true,
        })
        refreshContent(client, coordinates)
      },
    })
  }
  return { remove, changeName, error: removal.error ?? rename.error }
}
