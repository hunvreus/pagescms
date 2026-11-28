import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { EditorSkeleton } from '#/components/editor-skeleton'
import { useLocaleSelection } from '#/features/editor/locale-selection'
import {
  loadCodeEditor,
  preloadEditorsForFields,
} from '#/features/editor/editor-component-loaders'
import { parseLocalizedPath } from '#/lib/i18n'
import type { JsonValue } from '#/shared/json'
import { FileLocaleMenu } from '#/features/editor/file-locale-menu'
import { LocaleContext, LocaleMenu } from '#/features/editor/locale-context'
import {
  copyLocale,
  projectLocale,
  localizedEditorFields,
  localizedSnapshot,
  hasLocaleData,
  issueLocale,
  removeLocale,
} from '#/lib/i18n-values'
import { Spinner } from '#/components/ui/spinner'
import {
  FieldValidationProvider,
  useFieldValidation,
} from '#/features/editor/fields/field-validation'
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
import {
  DraftBadge,
  DraftSaveButton,
} from '#/features/drafts/draft-save-button'
import type { DraftControls } from '#/features/drafts/draft-save-button'
import { FileEditorHistory } from '#/components/file-editor-history'
import { useIsMobile } from '#/hooks/use-mobile'
import { EditorLayout } from '#/components/editor-layout'
import { ContentEntryFieldsSkeleton } from '#/components/content-entry-skeleton'
import { FileEditorMenu } from '#/components/file-editor-menu'
import { lazy, Suspense, useRef, useState, useMemo, useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
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

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { buildEntryBreadcrumb } from '#/features/editor/entry-breadcrumb'
import { EntryPageHeader } from '#/features/editor/entry-page-header'
import {
  getEntryTitle,
  getEntryDisplayTitle,
} from '#/features/editor/entry-title'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import { readEntry } from '#/client/api/entries'
import { updateRawEntry, updateStructuredEntry } from '#/client/api/entry-write'

const CodeEditor = lazy(loadCodeEditor)

type LoadedEntryData = Awaited<ReturnType<typeof readEntry>>
type EntryData = LoadedEntryData

export interface ContentEntryCoordinates {
  repoId?: string
  source?: string
  owner: string
  repo: string
  branch: string
  name: string
  path: string
}

export function ContentEntryEditor({
  initial: original,
  locale,
  coordinates,
  afterDeleteHref,
  renameBaseHref,
}: {
  initial: EntryData
  locale?: string
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  useEffect(() => {
    const load =
      original.mode === 'structured' || original.mode === 'structured-list'
        ? preloadEditorsForFields(original.fields)
        : loadCodeEditor()
    // Speculative failures must not block rendering; the lazy loader can retry.
    void load.catch(() => {})
  }, [original])
  const initial =
    original.i18n?.scheme === 'fields' &&
    locale &&
    original.i18n.locales.some((item) => item.code === locale)
      ? { ...original, locale }
      : original
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
    dialog: actions.confirmationDialog,
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
        const result = await actions.changeName(
          coordinates,
          sha,
          filename.trim(),
          hrefBase,
          draft,
        )
        return result !== null
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
  localeControl?: React.ReactNode
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

  const queryClient = useQueryClient()
  const commitMessage = useCommitMessage(initial.allowCustomMessage)
  const [messagePending, setMessagePending] = useState(false)
  const requestLock = useRef(false)
  const mutation =
    useContentMutation<Awaited<ReturnType<typeof updateRawEntry>>>()
  const activity = useContentActivity(coordinates)
  const saving =
    messagePending || (activity.pending && activity.kind === 'save')
  const draft = useContentDraft({
    target: coordinates,
    title: initial.label,
    schema: { mode: initial.mode },
    initialValue: initial.source,
    initialSha: initial.sha,
  })
  const { value: source, baseline: savedSource, baseSha: sha, dirty } = draft
  const merge = useDraftMerge(draft.session, remainingT({ message: 'Content' }))
  const setSource = draft.setValue
  const deletion = useEntryDeletion(
    coordinates,
    sha,
    afterDeleteHref,
    draft.session,
  )
  const rename = useEntryRename(coordinates, sha, renameBaseHref, draft.session)
  useUnsavedWarning(dirty || saving)

  async function persist(message?: string, handled = false) {
    const session = draft.session
    if (!session)
      throw new Error('Your draft is not ready. Reload and try again.')
    const { value: submitted, baseSha } = session.getSnapshot()
    await mutation.run({
      id: session.key,
      coordinates,
      kind: 'save',
      handledError: (failure) => draft.reportSaveError(failure) || handled,
      title: initial.label,
      expectedAccount: session.summary.account,
      retain: () => session.retain(),
      prepare: () => session.beginSave(submitted),
      run: () =>
        updateRawEntry({
          ...coordinates,
          repoId: session.summary.target.repoId,
          source: submitted,
          sha: baseSha,
          message,
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
    if (
      initial.editable === false ||
      requestLock.current ||
      activity.pending ||
      !draft.session
    )
      return
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
          const latest = await readEntry(coordinates)
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
        () => persist(message, true),
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
          localeControl={
            initial.i18n?.scheme === 'files' ? (
              <FileLocaleMenu
                coordinates={coordinates}
                config={initial.i18n}
                locale={initial.locale}
                schemaType={initial.schemaType}
                currentValue={source}
                draftReady={draft.ready}
                allowCreate={initial.operations.create}
                draftDirty={dirty}
                saved={Boolean(sha)}
                flush={draft.flush}
                onCopy={
                  initial.editable === false
                    ? undefined
                    : (value) => {
                        if (typeof value === 'string') setSource(value)
                      }
                }
              />
            ) : undefined
          }
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
          draft={draft}
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
      <OperationError
        error={merge.error}
        title={_t({ message: 'Could not review changes' })}
        fallback={_t({
          message:
            'Your draft is retained. Try saving again to review the latest changes.',
        })}
      />
      {rename.dialog}
      {merge.dialog}
      {commitMessage.dialog}
      {draft.ready ? (
        <Suspense fallback={<EditorSkeleton />}>
          <CodeEditor
            disabled={
              initial.editable === false || deletion.deleting || rename.renaming
            }
            label={_t({ message: 'Entry source' })}
            format={coordinates.path.split('.').pop() ?? 'markdown'}
            value={source}
            onChange={(value) => {
              setSource(value)
            }}
          />
        </Suspense>
      ) : draft.error ? (
        <OperationError
          error={draft.error}
          title={_t({ message: 'Draft needs attention' })}
          fallback={_t({
            message:
              'Could not restore or save this draft. Keep this editor open.',
          })}
        />
      ) : (
        <EditorSkeleton />
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
  initial: Exclude<EntryData, { mode: 'raw' }>
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

  const router = useRouter()
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
    schema: initial.i18n
      ? {
          fields: initial.fields,
          i18n: initial.i18n,
          localized: initial.localized,
        }
      : initial.fields,
    initialValue: initial.content,
    initialSha: initial.sha,
    title: (value) =>
      getEntryTitle({
        content: value,
        schema: {
          fields: initial.fields,
          i18n: initial.i18n,
          localized: initial.localized,
        },
        locale: initial.locale ?? undefined,
        filename: initial.filename,
        primaryField: initial.primaryField,
        schemaType: initial.schemaType,
        label: initial.label,
      }),
  })
  const { value: content, baseline: savedContent, baseSha: sha, dirty } = draft
  const [locale, setLocale] = useState(
    initial.locale ?? initial.i18n?.default ?? '',
  )
  useEffect(() => {
    setLocale(initial.locale ?? initial.i18n?.default ?? '')
  }, [initial.locale, initial.i18n?.default])
  const localizationSchema = {
    i18n: initial.i18n,
    fields: initial.fields,
    localized: initial.localized,
    list:
      initial.mode === 'structured-list'
        ? initial.list
        : 'list' in initial
          ? initial.list
          : undefined,
  }
  const pendingLocales = useMemo(
    () =>
      initial.i18n?.scheme === 'fields'
        ? initial.i18n.locales
            .filter(
              (item) =>
                JSON.stringify(
                  localizedSnapshot(localizationSchema, content, item.code),
                ) !==
                JSON.stringify(
                  localizedSnapshot(
                    localizationSchema,
                    savedContent,
                    item.code,
                  ),
                ),
            )
            .map((item) => item.code)
        : [],
    [content, savedContent, initial.i18n, initial.fields, initial.localized],
  )

  const merge = useDraftMerge(
    draft.session,
    initial.mode === 'structured-list'
      ? remainingT({ message: 'Items' })
      : remainingT({ message: 'Content' }),
    initial.i18n?.scheme === 'fields'
      ? localizedEditorFields({ ...localizationSchema, i18n: initial.i18n })
      : initial.fields,
    { ...coordinates, media: initial.media },
  )
  const setContent = draft.setValue
  const fields = useMemo(
    () =>
      Array.isArray(initial.fields)
        ? initial.fields.filter(isContentField)
        : [],
    [initial.fields],
  )
  const referenceContext = useMemo(
    () => ({ ...coordinates, media: initial.media, locale }),
    [
      coordinates.repoId,
      coordinates.source,
      coordinates.owner,
      coordinates.repo,
      coordinates.branch,
      coordinates.name,
      coordinates.path,
      initial.media,
      locale,
    ],
  )
  const fieldHandlers = useMemo(
    () =>
      new Map(
        fields.map((field) => {
          const name = String(field.name)
          return [
            name,
            (value: JsonValue | undefined) => {
              setContent((current) => {
                const next = Array.isArray(current) ? {} : { ...current }
                if (value === undefined) delete next[name]
                else next[name] = value
                return next
              })
            },
          ] as const
        }),
      ),
    [fields, setContent],
  )
  const validation = useFieldValidation(
    fields,
    initial.media,
    initial.mode === 'structured-list' ? initial.list : undefined,
    error,
    initial.i18n?.scheme === 'fields' ? localizationSchema : undefined,
  )
  const deletion = useEntryDeletion(
    coordinates,
    sha,
    afterDeleteHref,
    draft.session,
  )
  const rename = useEntryRename(coordinates, sha, renameBaseHref, draft.session)
  useUnsavedWarning(dirty || saving)

  async function persist(message?: string, handled = false) {
    const session = draft.session
    if (!session)
      throw new Error('Your draft is not ready. Reload and try again.')
    const { value: submitted, baseSha } = session.getSnapshot()
    validation.assert(submitted)
    await mutation.run({
      id: session.key,
      coordinates,
      kind: 'save',
      handledError: (failure) => draft.reportSaveError(failure) || handled,
      title: getEntryTitle({
        content: submitted,
        schema: localizationSchema,
        locale,
        filename: initial.filename,
        primaryField: initial.primaryField,
        schemaType: initial.schemaType,
        label: initial.label,
      }),
      fields: submitted,
      expectedAccount: session.summary.account,
      retain: () => session.retain(),
      prepare: () => session.beginSave(submitted),
      run: () =>
        updateStructuredEntry({
          ...coordinates,
          repoId: session.summary.target.repoId,
          content: submitted,
          sha: baseSha,
          message,
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
    if (
      initial.editable === false ||
      requestLock.current ||
      activity.pending ||
      !draft.session
    )
      return
    if (!validation.validate(draft.session.getSnapshot().value)) {
      const code = issueLocale(
        localizationSchema,
        content,
        validation.getIssues()[0]?.path ?? '',
      )
      if (code) setLocale(code)
      return
    }
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
      if (validation.accept(cause)) return
      await merge.handle(
        cause,
        async () => {
          const latest = await readEntry(coordinates)
          if (
            latest.mode === 'raw' ||
            latest.mode !== initial.mode ||
            JSON.stringify([latest.fields, latest.i18n, latest.localized]) !==
              JSON.stringify([initial.fields, initial.i18n, initial.localized])
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
        () => persist(message, true),
      )
      /* Mutation and draft state retain the failure across navigation. */
    } finally {
      requestLock.current = false
      setMessagePending(false)
    }
  }

  const availableLocales =
    initial.i18n?.scheme === 'fields'
      ? initial.i18n.locales
          .filter((item) =>
            hasLocaleData(localizationSchema, content, item.code),
          )
          .map((item) => item.code)
      : []
  const localeSelection = useLocaleSelection({
    locale,
    locales: initial.i18n?.locales ?? [],
    available: availableLocales,
    account: draft.session?.summary.account,
    ready: draft.ready,
    onSelect: (code: string) => {
      setLocale(code)
      const query = new URLSearchParams(router.state.location.searchStr)
      query.set('locale', code)
      void router.navigate({
        href: router.state.location.pathname + '?' + query,
        replace: true,
        resetScroll: false,
      })
    },
    onStart:
      initial.i18n?.scheme === 'fields'
        ? (target, copy) => {
            if (copy)
              setContent((current) =>
                hasLocaleData(localizationSchema, current, target)
                  ? current
                  : (copyLocale(
                      localizationSchema,
                      current,
                      locale,
                      target,
                      true,
                    ) as typeof current),
              )
          }
        : undefined,
  })

  return (
    <EditorLayout
      header={
        <EditorHeader
          activeLocale={locale}
          localeControl={
            initial.i18n?.scheme === 'fields' ? (
              <LocaleMenu
                locale={locale}
                locales={initial.i18n.locales}
                copySources={availableLocales}
                ready={draft.ready}
                onSelect={localeSelection.select}
                onRemove={() =>
                  setContent(
                    (current) =>
                      removeLocale(
                        localizationSchema,
                        current,
                        locale,
                      ) as typeof current,
                  )
                }
                pending={pendingLocales}
                errors={[
                  ...new Set(
                    validation.issues
                      .map((issue) =>
                        issueLocale(localizationSchema, content, issue.path),
                      )
                      .filter((code): code is string => Boolean(code)),
                  ),
                ]}
                onCopy={(source, replace) =>
                  setContent(
                    (current) =>
                      copyLocale(
                        localizationSchema,
                        current,
                        source,
                        locale,
                        replace,
                      ) as typeof current,
                  )
                }
              />
            ) : initial.i18n?.scheme === 'files' ? (
              <FileLocaleMenu
                coordinates={coordinates}
                config={initial.i18n}
                locale={initial.locale}
                schemaType={initial.schemaType}
                currentValue={content}
                fields={Array.isArray(initial.fields) ? initial.fields : []}
                media={initial.media}
                draftReady={draft.ready}
                allowCreate={initial.operations.create}
                draftDirty={dirty}
                saved={Boolean(sha)}
                flush={draft.flush}
                onCopy={
                  initial.editable === false
                    ? undefined
                    : (value) => {
                        if (typeof value !== 'string') setContent(value)
                      }
                }
              />
            ) : undefined
          }
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
          draft={draft}
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
      <OperationError
        error={merge.error}
        title={_t({ message: 'Could not review changes' })}
        fallback={_t({
          message:
            'Your draft is retained. Try saving again to review the latest changes.',
        })}
      />
      {localeSelection.dialog}
      {rename.dialog}
      {merge.dialog}
      {commitMessage.dialog}
      {draft.ready ? (
        <LocaleContext.Provider
          value={
            initial.i18n?.scheme === 'fields'
              ? {
                  locale,
                  locales: initial.i18n.locales,
                  defaultLocale: initial.i18n.default,
                  onSelect: localeSelection.select,
                }
              : null
          }
        >
          <FieldValidationProvider validation={validation}>
            <FieldGroup ref={validation.root}>
              <FieldError errors={validation.unrenderedIssues} />
              {initial.localized ? (
                <StructuredContentField
                  field={{
                    name: 'translations',
                    label: false,
                    type: 'object',
                    fields,
                    localized: true,
                    ...('list' in initial ? { list: initial.list } : {}),
                  }}
                  inheritedReadonly={
                    initial.editable === false ||
                    deletion.deleting ||
                    rename.renaming
                  }
                  referenceContext={{
                    ...coordinates,
                    media: initial.media,
                    locale,
                  }}
                  value={content}
                  onChange={(value) =>
                    setContent(isContentField(value) ? value : {})
                  }
                />
              ) : initial.mode === 'structured-list' ? (
                <StructuredContentField
                  field={{
                    name: 'items',
                    label: false,
                    type: 'object',
                    fields,
                    list: initial.list ?? true,
                  }}
                  inheritedReadonly={
                    initial.editable === false ||
                    deletion.deleting ||
                    rename.renaming
                  }
                  referenceContext={{
                    ...coordinates,
                    media: initial.media,
                    locale,
                  }}
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
                      inheritedReadonly={
                        initial.editable === false ||
                        deletion.deleting ||
                        rename.renaming
                      }
                      referenceContext={referenceContext}
                      value={Array.isArray(content) ? undefined : content[name]}
                      onChange={fieldHandlers.get(name)!}
                    />
                  )
                })
              )}
            </FieldGroup>
          </FieldValidationProvider>
        </LocaleContext.Provider>
      ) : draft.error ? (
        <OperationError
          error={draft.error}
          title={_t({ message: 'Draft needs attention' })}
          fallback={_t({
            message:
              'Could not restore or save this draft. Keep this editor open.',
          })}
        />
      ) : (
        <ContentEntryFieldsSkeleton fields={fields} />
      )}
    </EditorLayout>
  )
}

function EditorHeader({
  activeLocale,
  localeControl,
  initial,
  coordinates,
  actionData,
  saving,
  draft,
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
  activeLocale?: string
  localeControl?: React.ReactNode
  coordinates: ContentEntryCoordinates
  actionData: Record<string, unknown>
  saving: boolean
  draft: DraftControls
  dirty: boolean
  canDelete: boolean
  canRename: boolean
  deleting: boolean
  renaming: boolean
  onDelete: () => Promise<boolean>
  onRename: (filename: string) => Promise<boolean>
  onSave: () => void
}) {
  const { t: _t } = useUiMessages()

  const currentFilename = coordinates.path.split('/').at(-1) ?? ''
  const isMobile = useIsMobile()
  const canViewGitHub = useRepositoryGitHubLink()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameFilename, setRenameFilename] = useState(currentFilename)
  const collectionHref =
    initial.schemaType === 'collection'
      ? collectionHrefFor(coordinates)
      : undefined
  const currentLabel = getEntryDisplayTitle({
    content:
      initial.i18n?.scheme === 'fields' && 'fields' in initial
        ? projectLocale(
            { fields: initial.fields, localized: initial.localized },
            actionData.content as JsonValue,
            activeLocale ?? initial.i18n.default,
          )
        : actionData.content,
    filename: initial.filename,
    primaryField: initial.primaryField,
    schemaType: initial.schemaType,
    label: initial.label,
  })
  const segments = buildEntryBreadcrumb({
    currentLabel,
    entryPath:
      initial.i18n?.scheme === 'files'
        ? (parseLocalizedPath(
            {
              path: initial.rootPath,
              type: initial.schemaType,
              i18n: initial.i18n,
            },
            initial.path,
          )?.canonical ?? initial.path)
        : initial.path,
    groupTrail: initial.groupTrail,
    rootPath: initial.rootPath,
    schemaLabel: initial.label,
    schemaType: initial.schemaType,
  })

  return (
    <EntryPageHeader
      collectionHref={collectionHref}
      locale={activeLocale ?? initial.locale ?? undefined}
      segments={segments}
      status={
        <DraftBadge
          draft={draft}
          busy={saving}
          disabled={deleting || renaming}
        />
      }
      actions={
        <>
          {localeControl ??
            (initial.i18n?.scheme === 'files' ? (
              <FileLocaleMenu
                coordinates={coordinates}
                config={initial.i18n}
                locale={initial.locale}
                schemaType={initial.schemaType}
              />
            ) : null)}
          <RepositoryActionButtons
            actions={initial.actions}
            context={{
              type: initial.actionContextType,
              name: coordinates.name,
              path: coordinates.path,
              data: actionData,
            }}
            coordinates={coordinates}
            renderMenu={({ items, triggerRef, onCloseAutoFocus, busy }) => (
              <div className="flex items-center gap-1 md:gap-2">
                {initial.editable !== false ? (
                  <DraftSaveButton
                    draft={draft}
                    busy={saving}
                    disabled={deleting || renaming}
                    onSave={onSave}
                  />
                ) : null}
                <ButtonGroup
                  aria-label={_t({ message: 'History and entry actions' })}
                  className="empty:hidden"
                >
                  {initial.sha ? (
                    <EntryHistoryButton
                      key={`${coordinates.path}:${initial.sha}`}
                      coordinates={coordinates}
                    />
                  ) : null}
                  <FileEditorMenu
                    busy={busy}
                    triggerRef={triggerRef}
                    onCloseAutoFocus={onCloseAutoFocus}
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
                  >
                    {isMobile ? items : null}
                  </FileEditorMenu>
                </ButtonGroup>
              </div>
            )}
          />
          <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <UiTrans>Rename entry</UiTrans>
                </DialogTitle>
                <DialogDescription>
                  <UiTrans>
                    Change the filename for this entry. Saving creates a commit.
                  </UiTrans>
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
                  <FieldLabel htmlFor="entry-filename">
                    <UiTrans>Filename</UiTrans>
                  </FieldLabel>
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
                      <UiTrans>Cancel</UiTrans>
                    </Button>
                  </DialogClose>
                  <Button
                    aria-busy={renaming}
                    disabled={
                      renaming ||
                      !renameFilename.trim() ||
                      renameFilename.trim() === currentFilename
                    }
                    type="submit"
                  >
                    <UiTrans>Rename</UiTrans>
                    {renaming ? (
                      <Spinner aria-hidden="true" data-icon="inline-end" />
                    ) : null}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <UiTrans>Delete entry?</UiTrans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {initial.i18n?.scheme === 'fields' ? (
                    <UiTrans>
                      This deletes {currentFilename}, including all languages,
                      and creates a commit. This action cannot be undone here.
                    </UiTrans>
                  ) : (
                    <UiTrans>
                      This deletes {currentFilename} and creates a commit. This
                      action cannot be undone here.
                    </UiTrans>
                  )}
                  {dirty ? (
                    <UiTrans>
                      {' '}
                      Unsaved changes and the local draft will also be
                      discarded.
                    </UiTrans>
                  ) : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <UiTrans>Cancel</UiTrans>
                </AlertDialogCancel>
                <AlertDialogAction
                  aria-busy={deleting}
                  disabled={deleting}
                  variant="destructive"
                  onClick={(event) => {
                    event.preventDefault()
                    void onDelete().then((deleted) => {
                      if (deleted) setDeleteOpen(false)
                    })
                  }}
                >
                  <UiTrans>Delete</UiTrans>
                  {deleting ? (
                    <Spinner aria-hidden="true" data-icon="inline-end" />
                  ) : null}
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
  return `/github/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/${encodeURIComponent(coordinates.branch)}/collection/${encodeURIComponent(coordinates.name)}`
}

function EntryHistoryButton({
  coordinates,
}: {
  coordinates: ContentEntryCoordinates
}) {
  return (
    <FileEditorHistory
      key={JSON.stringify(coordinates)}
      coordinates={coordinates}
    />
  )
}
