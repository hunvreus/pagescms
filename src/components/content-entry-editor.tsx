import { useEntryActions } from '#/features/content/use-entry-actions'
import type { DraftSession } from '#/features/drafts/draft-session'
import {
  confirmContentWrite,
  confirmEntry,
  refreshContent,
  useContentActivity,
  useContentMutation,
} from '#/features/content/content-mutations'
import { useCommitMessage } from '#/features/editor/commit-message-dialog'
import { useContentDraft } from '#/features/drafts/use-content-draft'
import { useDraftMerge } from '#/features/drafts/use-draft-merge'
import { isContentConflict } from '#/lib/content-conflict'
import { ContentDraftRecovery } from '#/features/drafts/content-draft-status'
import { DraftSaveButton } from '#/features/drafts/draft-save-button'
import { FileEditorHistory } from '#/components/file-editor-history'
import { EditorLayout } from '#/components/editor-layout'
import { ContentEntryFieldsSkeleton } from '#/components/content-entry-skeleton'
import { FileEditorMenu } from '#/components/file-editor-menu'
import { lazy, Suspense, useRef, useState } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { useQueryClient } from '@tanstack/react-query'

import { StructuredContentField } from '#/components/structured-content-field'
import { isContentField } from '#/lib/content-field'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { OperationError } from '#/components/operation-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { buildEntryBreadcrumb } from '#/features/editor/entry-breadcrumb'
import { EntryPageHeader } from '#/features/editor/entry-page-header'
import {
  getEntryTitle,
  getEntryDisplayTitle,
} from '#/features/editor/entry-title'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import {
  getEntryHistory,
  getRawEntry,
  updateRawEntry,
  updateStructuredEntry,
} from '#/functions/entry-editor'

const CodeEditor = lazy(
  createClientOnlyFn(() =>
    import('#/components/code-editor').then((module) => ({
      default: module.CodeEditor,
    })),
  ),
)

type LoadedEntryData = Awaited<ReturnType<typeof getRawEntry>>
type EntryData = LoadedEntryData extends infer Entry
  ? Entry extends { sha: string }
    ? Omit<Entry, 'sha'> & { sha: string | null }
    : never
  : never

export interface ContentEntryCoordinates {
  owner: string
  repo: string
  branch: string
  name: string
  path: string
}

export function ContentEntryEditor({
  initial,
  coordinates,
  afterDeleteHref,
  renameBaseHref,
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  return initial.mode === 'structured' || initial.mode === 'structured-list' ? (
    <StructuredEntryEditor
      key={JSON.stringify(coordinates)}
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
      renameBaseHref={renameBaseHref}
    />
  ) : (
    <RawEntryEditor
      key={JSON.stringify(coordinates)}
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
      renameBaseHref={renameBaseHref}
    />
  )
}

type EntryDraftHandle = Pick<
  DraftSession<unknown>,
  'flush' | 'retain' | 'detach' | 'localError'
>
function useEntryDeletion(
  coordinates: ContentEntryCoordinates,
  sha: string | null,
  href: string,
  draft?: EntryDraftHandle,
) {
  const actions = useEntryActions()
  const activity = useContentActivity(coordinates)
  return {
    deleting: activity.pending && activity.kind === 'delete',
    error: activity.error,
    async remove() {
      if (!sha || activity.pending) return false
      try {
        await actions.remove(coordinates, sha, href, draft)
        return true
      } catch {
        return false
      }
    },
  }
}
function useEntryRename(
  coordinates: ContentEntryCoordinates,
  sha: string | null,
  hrefBase?: string,
  draft?: EntryDraftHandle,
) {
  const actions = useEntryActions()
  const activity = useContentActivity(coordinates)
  return {
    renaming: activity.pending && activity.kind === 'rename',
    error: activity.error,
    async rename(filename: string) {
      if (
        !hrefBase ||
        !sha ||
        activity.pending ||
        !filename.trim() ||
        filename.trim() === coordinates.path.split('/').at(-1)
      )
        return false
      try {
        await actions.changeName(
          coordinates,
          sha,
          filename.trim(),
          hrefBase,
          draft,
        )
        return true
      } catch {
        return false
      }
    },
  }
}

function RawEntryEditor({
  initial,
  coordinates,
  afterDeleteHref,
  renameBaseHref,
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  const queryClient = useQueryClient()
  const commitMessage = useCommitMessage(initial.allowCustomMessage)
  const [messagePending, setMessagePending] = useState(false)
  const requestLock = useRef(false)
  const mutation =
    useContentMutation<Awaited<ReturnType<typeof updateRawEntry>>>()
  const activity = useContentActivity(coordinates)
  const saving =
    messagePending || (activity.pending && activity.kind === 'save')
  const error = activity.error
  const draft = useContentDraft({
    target: coordinates,
    title: initial.label,
    schema: { mode: initial.mode },
    initialValue: initial.source,
    initialSha: initial.sha,
  })
  const { value: source, baseline: savedSource, baseSha: sha, dirty } = draft
  const merge = useDraftMerge(draft.session, 'Content')
  const setSource = draft.setValue
  const deletion = useEntryDeletion(
    coordinates,
    sha,
    afterDeleteHref,
    draft.session,
  )
  const rename = useEntryRename(coordinates, sha, renameBaseHref, draft.session)
  useUnsavedWarning(dirty || saving)

  async function persist(message?: string) {
    const session = draft.session
    if (!session)
      throw new Error('Your draft is not ready. Reload and try again.')
    const { value: submitted, baseSha } = session.getSnapshot()
    await mutation.run({
      id: session.key,
      coordinates,
      kind: 'save',
      title: initial.label,
      expectedAccount: session.summary.account,
      retain: () => session.retain(),
      prepare: () => session.beginSave(submitted),
      run: () =>
        updateRawEntry({
          data: { ...coordinates, source: submitted, sha: baseSha, message },
        }),
      confirmed: async (result, isActiveAccount) => {
        if (isActiveAccount())
          confirmContentWrite(queryClient, coordinates, result)
        await session.acknowledge(
          submitted,
          result.entry?.source ?? submitted,
          result.sha,
        )
        if (isActiveAccount()) refreshContent(queryClient, coordinates)
      },
    })
  }

  async function save() {
    if (requestLock.current || activity.pending || !draft.session) return
    requestLock.current = true
    setMessagePending(true)
    merge.clearError()
    let message: string | undefined
    try {
      const requested = await commitMessage.request()
      if (requested === null) return
      message = requested
      await persist(message)
    } catch (cause) {
      await merge.handle(
        cause,
        async () => {
          const latest = await getRawEntry({ data: coordinates })
          if (latest.mode !== initial.mode)
            throw new Error(
              'The content configuration changed. Reload before reviewing your draft.',
            )
          return {
            value: latest.source,
            sha: latest.sha,
            onApplied: () => confirmEntry(queryClient, coordinates, latest),
          }
        },
        () => persist(message),
      )
      /* Mutation and draft state retain the failure across navigation. */
    } finally {
      requestLock.current = false
      setMessagePending(false)
    }
  }

  return (
    <EditorLayout
      header={
        <EditorHeader
          actionData={{
            label: initial.label,
            sha,
            content: savedSource,
          }}
          coordinates={coordinates}
          dirty={dirty}
          canDelete={initial.operations.delete && Boolean(sha)}
          initial={initial}
          saving={saving}
          draftReady={draft.ready}
          draftSavedAt={draft.savedAt}
          onDiscard={() => draft.discard()}
          deleting={deletion.deleting}
          canRename={
            initial.operations.rename && Boolean(renameBaseHref) && Boolean(sha)
          }
          renaming={rename.renaming}
          onDelete={() => deletion.remove()}
          onRename={(filename) => rename.rename(filename)}
          onSave={() => void save()}
        />
      }
    >
      <EditorError
        error={merge.error ?? error ?? deletion.error ?? rename.error}
      />
      <ContentDraftRecovery draft={draft} />
      {merge.dialog}
      {commitMessage.dialog}
      {draft.ready ? (
        <ClientOnly fallback={<ContentEntryFieldsSkeleton />}>
          <Suspense fallback={<ContentEntryFieldsSkeleton />}>
            <CodeEditor
              disabled={deletion.deleting || rename.renaming}
              label="Entry source"
              format={coordinates.path.split('.').pop() ?? 'markdown'}
              value={source}
              onChange={(value) => {
                setSource(value)
              }}
            />
          </Suspense>
        </ClientOnly>
      ) : (
        <ContentEntryFieldsSkeleton />
      )}
    </EditorLayout>
  )
}

function StructuredEntryEditor({
  initial,
  coordinates,
  afterDeleteHref,
  renameBaseHref,
}: {
  initial:
    | Extract<EntryData, { mode: 'structured' }>
    | Extract<EntryData, { mode: 'structured-list' }>
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  const queryClient = useQueryClient()
  const commitMessage = useCommitMessage(initial.allowCustomMessage)
  const [messagePending, setMessagePending] = useState(false)
  const requestLock = useRef(false)
  const mutation =
    useContentMutation<Awaited<ReturnType<typeof updateStructuredEntry>>>()
  const activity = useContentActivity(coordinates)
  const saving =
    messagePending || (activity.pending && activity.kind === 'save')
  const error = activity.error
  const draft = useContentDraft({
    target: coordinates,
    schema: initial.fields,
    initialValue: initial.content,
    initialSha: initial.sha,
    title: (value) =>
      getEntryTitle({
        content: value,
        filename: initial.filename,
        primaryField: initial.primaryField,
      }),
  })
  const { value: content, baseline: savedContent, baseSha: sha, dirty } = draft
  const merge = useDraftMerge(
    draft.session,
    initial.mode === 'structured-list' ? 'Items' : 'Content',
    initial.fields,
    { ...coordinates, media: initial.media },
  )
  const setContent = draft.setValue
  const fields = Array.isArray(initial.fields)
    ? initial.fields.filter(isContentField)
    : []
  const deletion = useEntryDeletion(
    coordinates,
    sha,
    afterDeleteHref,
    draft.session,
  )
  const rename = useEntryRename(coordinates, sha, renameBaseHref, draft.session)
  useUnsavedWarning(dirty || saving)

  async function persist(message?: string) {
    const session = draft.session
    if (!session)
      throw new Error('Your draft is not ready. Reload and try again.')
    const { value: submitted, baseSha } = session.getSnapshot()
    await mutation.run({
      id: session.key,
      coordinates,
      kind: 'save',
      title: getEntryTitle({
        content: submitted,
        filename: initial.filename,
        primaryField: initial.primaryField,
      }),
      fields: submitted,
      expectedAccount: session.summary.account,
      retain: () => session.retain(),
      prepare: () => session.beginSave(submitted),
      run: () =>
        updateStructuredEntry({
          data: { ...coordinates, content: submitted, sha: baseSha, message },
        }),
      confirmed: async (result, isActiveAccount) => {
        if (isActiveAccount())
          confirmContentWrite(queryClient, coordinates, result)
        await session.acknowledge(
          submitted,
          result.entry && result.entry.mode !== 'raw'
            ? result.entry.content
            : submitted,
          result.sha,
        )
        if (isActiveAccount()) refreshContent(queryClient, coordinates)
      },
    })
  }

  async function save() {
    if (requestLock.current || activity.pending || !draft.session) return
    requestLock.current = true
    setMessagePending(true)
    merge.clearError()
    let message: string | undefined
    try {
      const requested = await commitMessage.request()
      if (requested === null) return
      message = requested
      await persist(message)
    } catch (cause) {
      await merge.handle(
        cause,
        async () => {
          const latest = await getRawEntry({ data: coordinates })
          if (
            latest.mode === 'raw' ||
            latest.mode !== initial.mode ||
            JSON.stringify(latest.fields) !== JSON.stringify(initial.fields)
          )
            throw new Error(
              'The content configuration changed. Reload before reviewing your draft.',
            )
          return {
            value: latest.content,
            sha: latest.sha,
            onApplied: () => confirmEntry(queryClient, coordinates, latest),
          }
        },
        () => persist(message),
      )
      /* Mutation and draft state retain the failure across navigation. */
    } finally {
      requestLock.current = false
      setMessagePending(false)
    }
  }

  return (
    <EditorLayout
      header={
        <EditorHeader
          actionData={{
            label: initial.label,
            sha,
            content: savedContent,
          }}
          coordinates={coordinates}
          dirty={dirty}
          canDelete={initial.operations.delete && Boolean(sha)}
          initial={initial}
          saving={saving}
          draftReady={draft.ready}
          draftSavedAt={draft.savedAt}
          onDiscard={() => draft.discard()}
          deleting={deletion.deleting}
          canRename={
            initial.operations.rename && Boolean(renameBaseHref) && Boolean(sha)
          }
          renaming={rename.renaming}
          onDelete={() => deletion.remove()}
          onRename={(filename) => rename.rename(filename)}
          onSave={() => void save()}
        />
      }
    >
      <EditorError
        error={merge.error ?? error ?? deletion.error ?? rename.error}
      />
      <ContentDraftRecovery draft={draft} />
      {merge.dialog}
      {commitMessage.dialog}
      {draft.ready ? (
        <FieldGroup>
          {initial.mode === 'structured-list' ? (
            <StructuredContentField
              field={{
                name: 'items',
                label: false,
                type: 'object',
                fields,
                list: initial.list ?? true,
              }}
              inheritedReadonly={deletion.deleting || rename.renaming}
              referenceContext={{ ...coordinates, media: initial.media }}
              value={content}
              onChange={(value) => {
                setContent(Array.isArray(value) ? value : [])
              }}
            />
          ) : (
            fields.map((field) => {
              const name = String(field.name)
              return (
                <StructuredContentField
                  field={field}
                  key={name}
                  inheritedReadonly={deletion.deleting || rename.renaming}
                  referenceContext={{ ...coordinates, media: initial.media }}
                  value={Array.isArray(content) ? undefined : content[name]}
                  onChange={(value) => {
                    setContent((current) => {
                      const next = Array.isArray(current) ? {} : { ...current }
                      if (value === undefined) delete next[name]
                      else next[name] = value
                      return next
                    })
                  }}
                />
              )
            })
          )}
        </FieldGroup>
      ) : (
        <ContentEntryFieldsSkeleton />
      )}
    </EditorLayout>
  )
}

function EditorHeader({
  initial,
  coordinates,
  actionData,
  saving,
  draftReady,
  draftSavedAt,
  onDiscard,
  dirty,
  canDelete,
  canRename,
  deleting,
  renaming,
  onDelete,
  onRename,
  onSave,
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  actionData: Record<string, unknown>
  saving: boolean
  draftReady: boolean
  draftSavedAt: number | null
  onDiscard: () => Promise<void>
  dirty: boolean
  canDelete: boolean
  canRename: boolean
  deleting: boolean
  renaming: boolean
  onDelete: () => Promise<boolean>
  onRename: (filename: string) => Promise<boolean>
  onSave: () => void
}) {
  const currentFilename = coordinates.path.split('/').at(-1) ?? ''
  const canViewGitHub = useRepositoryGitHubLink()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameFilename, setRenameFilename] = useState(currentFilename)
  const collectionHref =
    initial.schemaType === 'collection'
      ? collectionHrefFor(coordinates)
      : undefined
  const currentLabel = getEntryDisplayTitle({
    content: actionData.content,
    filename: initial.filename,
    primaryField: initial.primaryField,
  })
  const segments = buildEntryBreadcrumb({
    currentLabel,
    entryPath: initial.path,
    groupTrail: initial.groupTrail,
    rootPath: initial.rootPath,
    schemaLabel: initial.label,
    schemaType: initial.schemaType,
  })

  return (
    <EntryPageHeader
      collectionHref={collectionHref}
      segments={segments}
      actions={
        <>
          <RepositoryActionButtons
            actions={initial.actions}
            context={{
              type: initial.actionContextType,
              name: coordinates.name,
              path: coordinates.path,
              data: actionData,
            }}
            coordinates={coordinates}
          />
          <div className="flex items-center gap-2">
            <DraftSaveButton
              dirty={dirty}
              ready={draftReady}
              savedAt={draftSavedAt}
              busy={saving}
              disabled={deleting || renaming}
              onSave={onSave}
              onDiscard={onDiscard}
            />
            <ButtonGroup
              aria-label="History and entry actions"
              className="empty:hidden"
            >
              {initial.sha ? (
                <EntryHistoryButton
                  key={`${coordinates.path}:${initial.sha}`}
                  coordinates={coordinates}
                />
              ) : null}
              <FileEditorMenu
                disabled={saving || deleting || renaming}
                href={
                  canViewGitHub && initial.sha
                    ? `https://github.com/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/blob/${encodeURIComponent(coordinates.branch)}/${coordinates.path.split('/').map(encodeURIComponent).join('/')}`
                    : undefined
                }
                onRename={
                  canRename
                    ? () => {
                        setRenameFilename(currentFilename)
                        setRenameOpen(true)
                      }
                    : undefined
                }
                onDelete={canDelete ? () => setDeleteOpen(true) : undefined}
              />
            </ButtonGroup>
          </div>
          <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename entry</DialogTitle>
                <DialogDescription>
                  Change the filename for this entry. Saving creates a commit.
                </DialogDescription>
              </DialogHeader>
              <form
                className="contents"
                onSubmit={(event) => {
                  event.preventDefault()
                  void onRename(renameFilename).then((renamed) => {
                    if (renamed) setRenameOpen(false)
                  })
                }}
              >
                <Field>
                  <FieldLabel htmlFor="entry-filename">Filename</FieldLabel>
                  <Input
                    autoFocus
                    id="entry-filename"
                    value={renameFilename}
                    onChange={(event) => setRenameFilename(event.target.value)}
                  />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    disabled={
                      renaming ||
                      !renameFilename.trim() ||
                      renameFilename.trim() === currentFilename
                    }
                    type="submit"
                  >
                    Rename
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes {currentFilename} and creates a commit. This
                  action cannot be undone from Pages CMS.
                  {dirty
                    ? ' Unsaved changes and the local draft will also be discarded.'
                    : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  variant="destructive"
                  onClick={(event) => {
                    event.preventDefault()
                    void onDelete().then((deleted) => {
                      if (deleted) setDeleteOpen(false)
                    })
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    />
  )
}

function collectionHrefFor(coordinates: ContentEntryCoordinates) {
  return `/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/${encodeURIComponent(coordinates.branch)}/collection/${encodeURIComponent(coordinates.name)}`
}

function EntryHistoryButton({
  coordinates,
}: {
  coordinates: ContentEntryCoordinates
}) {
  return (
    <FileEditorHistory
      key={JSON.stringify(coordinates)}
      load={(page) => getEntryHistory({ data: { ...coordinates, page } })}
    />
  )
}

function EditorError({ error }: { error: unknown }) {
  if (isContentConflict(error)) return null
  return <OperationError error={error} fallback="Could not update entry." />
}
