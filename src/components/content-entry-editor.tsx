import type { ReactNode } from 'react'
import { useEntryActions } from '#/features/content/use-entry-actions'
import type { DraftSession } from '#/features/drafts/draft-session'
import {
  confirmContentWrite,
  refreshContent,
  useContentActivity,
  useContentMutation,
} from '#/features/content/content-mutations'
import { useCommitMessage } from '#/features/editor/commit-message-dialog'
import { useContentDraft } from '#/features/drafts/use-content-draft'
import {
  ContentDraftRecovery,
  ContentDraftIndicator,
} from '#/features/drafts/content-draft-status'
import { FileEditorHistory } from '#/components/file-editor-history'
import { EditorLayout } from '#/components/editor-layout'
import { FileEditorMenu } from '#/components/file-editor-menu'
import { lazy, Suspense, useRef, useState } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'

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
import { Skeleton } from '#/components/ui/skeleton'
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
  updateRawEntry,
  updateStructuredEntry,
} from '#/functions/entry-editor'
import type { getRawEntry } from '#/functions/entry-editor'

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
  const setSource = draft.setValue
  const deletion = useEntryDeletion(
    coordinates,
    sha,
    afterDeleteHref,
    draft.session,
  )
  const rename = useEntryRename(coordinates, sha, renameBaseHref, draft.session)
  useUnsavedWarning(dirty || saving)

  async function save() {
    if (requestLock.current || activity.pending || !draft.session) return
    requestLock.current = true
    setMessagePending(true)
    const session = draft.session
    try {
      const message = await commitMessage.request()
      if (message === null) return
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
    } catch {
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
          draftIndicator={
            <ContentDraftIndicator draft={draft} saving={saving} />
          }
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
      <EditorError error={error ?? deletion.error ?? rename.error} />
      <ContentDraftRecovery draft={draft} />
      {commitMessage.dialog}
      {draft.ready ? (
        <ClientOnly fallback={<Skeleton className="min-h-32" />}>
          <Suspense fallback={<Skeleton className="min-h-32" />}>
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
        <Skeleton className="min-h-32" />
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

  async function save() {
    if (requestLock.current || activity.pending || !draft.session) return
    requestLock.current = true
    setMessagePending(true)
    const session = draft.session
    try {
      const message = await commitMessage.request()
      if (message === null) return
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
    } catch {
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
          draftIndicator={
            <ContentDraftIndicator draft={draft} saving={saving} />
          }
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
      <EditorError error={error ?? deletion.error ?? rename.error} />
      <ContentDraftRecovery draft={draft} />
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
        <Skeleton className="min-h-32" />
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
  draftIndicator,
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
  draftIndicator: ReactNode
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
            {draftIndicator}
            <Button
              disabled={saving || deleting || renaming || !dirty || !draftReady}
              onClick={onSave}
            >
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              {saving ? 'Saving' : 'Save'}
            </Button>
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
  return <OperationError error={error} fallback="Could not update entry." />
}
