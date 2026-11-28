import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import {
  externalRepositoryId,
  repositoryRequest,
} from '#/lib/repository-identity'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  OperationAcknowledgementError,
  withErrorNotification,
} from '#/lib/notifications'
import {
  deleteEntry,
  renameEntry,
  moveEntry,
  getEntryRenamePlan,
} from '#/client/api/entry-write'
import { authenticationQueryOptions } from '#/client/queries/session'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { entryQueryOptions } from '#/client/queries/content'
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
import type { readRawEntry as getRawEntry } from '#/server/services/content'
import type { getCollection } from '#/client/api/collections'
import type { DraftSession } from '#/features/drafts/draft-session'
import { queryKeys } from '#/client/queries/keys'

type FileCoordinates = ContentCoordinates & { path: string }
export function useEntryActions() {
  const { t: _t } = useUiMessages()

  type Move = { path: string; newPath: string; sha: string }
  const [plan, setPlan] = useState<Move[] | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const resolver = useRef<((accept: boolean) => void) | undefined>(undefined)
  useEffect(
    () => () => {
      resolver.current?.(false)
    },
    [],
  )
  function finish(accept: boolean) {
    setPlanOpen(false)
    resolver.current?.(accept)
    resolver.current = undefined
  }
  async function confirmRename(input: {
    owner: string
    repo: string
    branch: string
    name: string
    path: string
    sha: string
    repoId?: string
    filename?: string
    newPath?: string
  }) {
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    const moves = await withErrorNotification(
      () => getEntryRenamePlan(input),
      _t({ message: 'Could not prepare the rename.' }),
      {
        active: () =>
          client.getQueryData(authenticationQueryOptions().queryKey)?.user
            ?.id === account,
      },
    )
    if (moves.length > 1) {
      setPlan(moves)
      setPlanOpen(true)
      if (
        !(await new Promise<boolean>((resolve) => {
          resolver.current?.(false)
          resolver.current = resolve
        }))
      )
        return null
    }
    return moves
  }
  const confirmationDialog = (
    <Dialog
      open={planOpen}
      onOpenChange={(open) => {
        if (!open) finish(false)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <UiTrans>Rename translations</UiTrans>
          </DialogTitle>
          <DialogDescription>
            <UiTrans>
              These files will be renamed together in one commit.
            </UiTrans>
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-auto text-sm">
          {plan?.map((move) => (
            <li key={move.path}>
              <div className="break-all text-muted-foreground">{move.path}</div>
              <div className="break-all">→ {move.newPath}</div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(false)}>
            <UiTrans>Cancel</UiTrans>
          </Button>
          <Button onClick={() => finish(true)}>
            <UiTrans>Rename translations</UiTrans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  const client = useQueryClient()
  const router = useRouter()
  const removal = useContentMutation<Awaited<ReturnType<typeof deleteEntry>>>()
  const rename = useContentMutation<Awaited<ReturnType<typeof renameEntry>>>()
  function key(coordinates: FileCoordinates) {
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    const repositoryData = client.getQueryData(
      repositoryQueryOptions(coordinates).queryKey,
    )
    return account && repositoryData
      ? contentDraftKey(account, repositoryData.source, {
          ...coordinates,
          repoId:
            coordinates.repoId ??
            externalRepositoryId(repositoryData.repository.id),
        })
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
      run: () => deleteEntry({ ...repositoryRequest(coordinates), sha }),
      confirmed: async (_result, isActiveAccount) => {
        let recoveryError: unknown
        draft?.detach()
        if (draftKey) {
          try {
            await deleteEntryDraft(draftKey, revision)
          } catch (error) {
            draft?.localError(error)
            recoveryError = error
          }
        }
        if (isActiveAccount()) {
          if (href && router.state.location.href === origin)
            await router.navigate({ href })
          if (!isActiveAccount()) return
          removeEntryCache(client, coordinates)
          refreshContent(client, coordinates)
        }
        if (recoveryError)
          throw new OperationAcknowledgementError(
            recoveryError,
            _t({
              message:
                'File deleted. A newer local draft was retained for download.',
            }),
          )
      },
    })
  }
  async function changePath(
    coordinates: FileCoordinates,
    sha: string,
    request: { filename?: string; newPath?: string },
    hrefBase?: string,
    draft?: Pick<
      DraftSession<unknown>,
      'flush' | 'retain' | 'detach' | 'localError'
    >,
  ) {
    const confirmedMoves = await confirmRename({
      ...repositoryRequest(coordinates),
      sha,
      ...request,
    })
    if (!confirmedMoves) return null
    const origin = router.state.location.href
    const draftKey = key(coordinates)
    const destination = confirmedMoves.find(
      (move) => move.path === coordinates.path,
    )!.newPath
    const filename = destination.split('/').at(-1)!
    let revision = 0
    let draftMoved = true
    const siblingDrafts: {
      key: string
      revision: number
      move: (typeof confirmedMoves)[number]
    }[] = []
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
        for (const move of confirmedMoves) {
          const sourceKey = key({ ...coordinates, path: move.path })
          const destinationKey = key({ ...coordinates, path: move.newPath })
          if (destinationKey && (await readDraft(destinationKey)))
            throw new Error(
              'A destination has a local draft. Keep or discard it before renaming.',
            )
          if (sourceKey && move.path !== coordinates.path) {
            const stored = await readDraft(sourceKey)
            if (stored)
              siblingDrafts.push({
                key: sourceKey,
                revision: stored.revision,
                move,
              })
          }
        }
        if (draftKey) revision = (await readDraft(draftKey))?.revision ?? 0
      },
      run: () =>
        request.newPath
          ? moveEntry({
              ...repositoryRequest(coordinates),
              sha,
              newPath: request.newPath,
              confirmedMoves,
            })
          : renameEntry({
              ...repositoryRequest(coordinates),
              sha,
              filename: request.filename!,
              confirmedMoves,
            }),
      confirmed: async (result, isActiveAccount) => {
        const recoveryErrors: unknown[] = []
        for (const sibling of siblingDrafts) {
          try {
            await relocateEntryDraft(
              sibling.key,
              sibling.revision,
              sibling.move.newPath,
            )
          } catch (error) {
            recoveryErrors.push(error)
          }
        }
        if (draftKey) {
          try {
            await relocateEntryDraft(draftKey, revision, destination)
            draft?.detach()
          } catch (error) {
            draft?.localError(error)
            recoveryErrors.push(error)
            draftMoved = false
            draft?.detach()
          }
        }
        if (!isActiveAccount()) return
        const old = client.getQueryData(entryQueryOptions(coordinates).queryKey)
        if (old && old.sha === result.sha)
          client.setQueryData<Awaited<ReturnType<typeof getRawEntry>>>(
            entryQueryOptions({ ...coordinates, path: destination }).queryKey,
            {
              ...old,
              path: destination,
              filename: destination.split('/').at(-1)!,
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
                      path: destination,
                      name: destination.split('/').at(-1)!,
                      fields:
                        typeof entry.fields === 'object' &&
                        entry.fields &&
                        !Array.isArray(entry.fields)
                          ? {
                              ...entry.fields,
                              name: destination.split('/').at(-1)!,
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
            href: `${hrefBase}/${destination.split('/').map(encodeURIComponent).join('/')}${new URLSearchParams(router.state.location.searchStr).get('locale') ? '?locale=' + encodeURIComponent(new URLSearchParams(router.state.location.searchStr).get('locale')!) : ''}`,
          })
        if (!isActiveAccount()) return
        client.removeQueries({
          queryKey: entryQueryOptions(coordinates).queryKey,
          exact: true,
        })
        for (const move of confirmedMoves)
          client.removeQueries({
            queryKey: entryQueryOptions({ ...coordinates, path: move.path })
              .queryKey,
            exact: true,
          })
        refreshContent(client, coordinates)
        if (recoveryErrors.length)
          throw new OperationAcknowledgementError(
            new AggregateError(recoveryErrors),
            _t({
              message:
                'File renamed. Some local drafts could not be moved and were retained for recovery.',
            }),
          )
      },
    })
  }
  const changeName = (
    coordinates: FileCoordinates,
    sha: string,
    filename: string,
    hrefBase?: string,
    draft?: Pick<
      DraftSession<unknown>,
      'flush' | 'retain' | 'detach' | 'localError'
    >,
  ) => changePath(coordinates, sha, { filename }, hrefBase, draft)
  return {
    remove,
    changeName,
    changePath,
    confirmationDialog,
    confirmRename,
    error: removal.error ?? rename.error,
  }
}
