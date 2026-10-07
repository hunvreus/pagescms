import { lazy, Suspense, useState } from 'react'
import { ClientOnly, useRouter } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Check,
  History,
  LoaderCircle,
  EllipsisVertical,
} from 'lucide-react'

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
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { buildEntryBreadcrumb } from '#/features/editor/entry-breadcrumb'
import { EntryPageHeader } from '#/features/editor/entry-page-header'
import { getEntryDisplayTitle } from '#/features/editor/entry-title'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import {
  deleteEntry,
  getEntryHistory,
  renameEntry,
  updateRawEntry,
  updateStructuredEntry,
} from '#/functions/entry-editor'
import type { getRawEntry } from '#/functions/entry-editor'
import { queryKeys } from '#/queries/keys'

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
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
      renameBaseHref={renameBaseHref}
    />
  ) : (
    <RawEntryEditor
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
      renameBaseHref={renameBaseHref}
    />
  )
}

function useEntryDeletion(
  coordinates: ContentEntryCoordinates,
  sha: string | null,
  afterDeleteHref: string,
) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  return {
    deleting,
    error,
    async remove() {
      if (!sha) return false
      setDeleting(true)
      setError(null)
      try {
        await deleteEntry({ data: { ...coordinates, sha } })
        await queryClient.invalidateQueries({
          queryKey: queryKeys.branch(coordinates),
        })
        await router.navigate({ href: afterDeleteHref })
        return true
      } catch (cause) {
        setError(cause)
        return false
      } finally {
        setDeleting(false)
      }
    },
  }
}

function useEntryRename(
  coordinates: ContentEntryCoordinates,
  sha: string | null,
  renameBaseHref?: string,
) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<unknown>(null)

  return {
    renaming,
    error,
    async rename(filename: string) {
      if (!renameBaseHref || !sha) return false
      const current = coordinates.path.split('/').at(-1) ?? ''
      const nextFilename = filename.trim()
      if (!nextFilename || nextFilename === current) return false
      setRenaming(true)
      setError(null)
      try {
        const result = await renameEntry({
          data: { ...coordinates, sha, filename: nextFilename },
        })
        await queryClient.invalidateQueries({
          queryKey: queryKeys.branch(coordinates),
        })
        await router.navigate({
          href: `${renameBaseHref}/${result.newPath.split('/').map(encodeURIComponent).join('/')}`,
        })
        return true
      } catch (cause) {
        setError(cause)
        return false
      } finally {
        setRenaming(false)
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
  const [source, setSource] = useState(initial.source)
  const [savedSource, setSavedSource] = useState(initial.source)
  const [sha, setSha] = useState(initial.sha)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const dirty = source !== savedSource
  const deletion = useEntryDeletion(coordinates, sha, afterDeleteHref)
  const rename = useEntryRename(coordinates, sha, renameBaseHref)
  useUnsavedWarning(dirty)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateRawEntry({
        data: { ...coordinates, source, sha },
      })
      setSha(result.sha)
      setSavedSource(source)
      setSaved(true)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(coordinates),
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="-m-4 md:-m-6">
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
        saved={saved}
        saving={saving}
        deleting={deletion.deleting}
        canRename={
          initial.operations.rename && Boolean(renameBaseHref) && Boolean(sha)
        }
        renaming={rename.renaming}
        onDelete={() => deletion.remove()}
        onRename={(filename) => rename.rename(filename)}
        onSave={() => void save()}
      />
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        <EditorError error={error ?? deletion.error ?? rename.error} />
        <ClientOnly
          fallback={<Skeleton className="min-h-[calc(100vh-13rem)]" />}
        >
          <Suspense
            fallback={<Skeleton className="min-h-[calc(100vh-13rem)]" />}
          >
            <CodeEditor
              label="Entry source"
              format={coordinates.path.split('.').pop() ?? 'markdown'}
              className="[&_.cm-content]:min-h-[calc(100vh-13rem)]"
              value={source}
              onChange={(value) => {
                setSource(value)
                setSaved(false)
              }}
            />
          </Suspense>
        </ClientOnly>
      </div>
    </div>
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
  const [content, setContent] = useState(initial.content)
  const [savedContent, setSavedContent] = useState(initial.content)
  const [sha, setSha] = useState(initial.sha)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const dirty = JSON.stringify(content) !== JSON.stringify(savedContent)
  const fields = Array.isArray(initial.fields)
    ? initial.fields.filter(isContentField)
    : []
  const deletion = useEntryDeletion(coordinates, sha, afterDeleteHref)
  const rename = useEntryRename(coordinates, sha, renameBaseHref)
  useUnsavedWarning(dirty)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateStructuredEntry({
        data: { ...coordinates, content, sha },
      })
      setSha(result.sha)
      setSavedContent(content)
      setSaved(true)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(coordinates),
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="-m-4 md:-m-6">
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
        saved={saved}
        saving={saving}
        deleting={deletion.deleting}
        canRename={
          initial.operations.rename && Boolean(renameBaseHref) && Boolean(sha)
        }
        renaming={rename.renaming}
        onDelete={() => deletion.remove()}
        onRename={(filename) => rename.rename(filename)}
        onSave={() => void save()}
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <EditorError error={error ?? deletion.error ?? rename.error} />
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
              referenceContext={{ ...coordinates, media: initial.media }}
              value={content}
              onChange={(value) => {
                setSaved(false)
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
                  referenceContext={{ ...coordinates, media: initial.media }}
                  value={Array.isArray(content) ? undefined : content[name]}
                  onChange={(value) => {
                    setSaved(false)
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
      </div>
    </div>
  )
}

function EditorHeader({
  initial,
  coordinates,
  actionData,
  saving,
  saved,
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
  saved: boolean
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
          {initial.sha ? (
            <EntryHistoryButton
              key={coordinates.path}
              coordinates={coordinates}
            />
          ) : null}
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
            <Button
              disabled={saving || deleting || renaming || !dirty}
              onClick={onSave}
            >
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : saved ? (
                <Check />
              ) : null}
              {saving ? 'Saving' : 'Save'}
            </Button>
            {canRename || canDelete || (canViewGitHub && initial.sha) ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Entry actions"
                    disabled={saving || deleting || renaming}
                    size="icon"
                    variant="outline"
                  >
                    <EllipsisVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canViewGitHub && initial.sha ? (
                    <>
                      <DropdownMenuItem asChild>
                        <a
                          href={`https://github.com/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/blob/${encodeURIComponent(coordinates.branch)}/${coordinates.path.split('/').map(encodeURIComponent).join('/')}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on GitHub{' '}
                          <ArrowUpRight className="ml-auto opacity-50" />
                        </a>
                      </DropdownMenuItem>
                      {canRename || canDelete ? (
                        <DropdownMenuSeparator />
                      ) : null}
                    </>
                  ) : null}
                  {canRename ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenameFilename(currentFilename)
                        setRenameOpen(true)
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                  ) : null}
                  {canRename && canDelete ? <DropdownMenuSeparator /> : null}
                  {canDelete ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleteOpen(true)}
                    >
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
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
                    {renaming ? (
                      <LoaderCircle className="animate-spin" />
                    ) : null}
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
                  {deleting ? <LoaderCircle className="animate-spin" /> : null}
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
  const canViewGitHub = useRepositoryGitHubLink()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof getEntryHistory>> | undefined
  >()
  const [error, setError] = useState<unknown>(null)

  async function loadHistory() {
    if (history || loading) return
    setLoading(true)
    setError(null)
    try {
      setHistory(await getEntryHistory({ data: coordinates }))
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) void loadHistory()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Entry history"
          size="icon"
          type="button"
          variant="outline"
        >
          {loading ? <LoaderCircle className="animate-spin" /> : <History />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        {error ? (
          <DropdownMenuItem disabled>Could not load history.</DropdownMenuItem>
        ) : loading || !history ? (
          <div role="status" aria-label="Loading history" className="space-y-1">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-1.5 py-1">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
        ) : history.length ? (
          history.slice(0, 3).map((commit) => (
            <DropdownMenuItem asChild key={commit.sha}>
              <a
                className="min-w-0 gap-3"
                href={canViewGitHub ? commit.url : undefined}
                rel="noreferrer"
                target="_blank"
              >
                <Avatar size="sm">
                  <AvatarImage
                    alt={`${commit.authorName}'s avatar`}
                    src={
                      commit.authorLogin
                        ? `https://github.com/${commit.authorLogin}.png`
                        : undefined
                    }
                  />
                  <AvatarFallback>
                    {historyInitials(commit.authorName)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate">{commit.authorName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {commit.authoredAt
                      ? new Date(commit.authoredAt).toLocaleString()
                      : 'Unknown date'}
                  </span>
                </span>
              </a>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No history found.
          </DropdownMenuItem>
        )}
        {canViewGitHub ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                className="whitespace-nowrap"
                href={`https://github.com/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/commits/${encodeURIComponent(coordinates.branch)}/${coordinates.path.split('/').map(encodeURIComponent).join('/')}`}
                rel="noreferrer"
                target="_blank"
              >
                View on GitHub
                <ArrowUpRight className="ml-auto opacity-50" />
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function historyInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function EditorError({ error }: { error: unknown }) {
  return <OperationError error={error} fallback="Could not update entry." />
}
