import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { HugeiconsIcon } from '@hugeicons/react'
import { useLocaleSelection } from '#/features/editor/locale-selection'
import { LocaleContext, LocaleMenu } from '#/features/editor/locale-context'
import {
  copyLocale,
  removeLocale,
  issueLocale,
  hasLocaleData,
} from '#/lib/i18n-values'
import X from '@hugeicons/core-free-icons/XIcon'
import {
  FieldValidationProvider,
  useFieldValidation,
} from '#/features/editor/fields/field-validation'
import { contentDraftKey, recordOpened } from '#/features/drafts/draft-store'
import {
  confirmContentWrite,
  refreshContent,
  useContentActivity,
  useContentMutation,
} from '#/features/content/content-mutations'
import { getEntryTitle } from '#/features/editor/entry-title'
import { useCommitMessage } from '#/features/editor/commit-message-dialog'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { useContentDraft } from '#/features/drafts/use-content-draft'
import {
  DraftBadge,
  DraftSaveButton,
} from '#/features/drafts/draft-save-button'
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import { StructuredContentField } from '#/components/structured-content-field'
import { ContentEntryFieldsSkeleton } from '#/components/content-entry-skeleton'
import { isContentField } from '#/lib/content-field'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { buildEntryBreadcrumb } from '#/features/editor/entry-breadcrumb'
import { EntryPageHeader } from '#/features/editor/entry-page-header'
import type { getCollection } from '#/client/api/collections'
import {
  createRawCollectionEntry,
  createStructuredCollectionEntry,
} from '#/client/api/entry-write'
import { initializeStructuredContent } from '#/lib/field-values'

import type { JsonObject, JsonValue } from '#/shared/json'

type CollectionData = Awaited<ReturnType<typeof getCollection>>

interface CollectionEntryCreatorProps {
  coordinates: {
    owner: string
    repo: string
    branch: string
    name: string
  }
  initial: CollectionData
  parent?: string
}

export function CollectionEntryCreator({
  coordinates,
  initial,
  parent,
}: CollectionEntryCreatorProps) {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

  const router = useRouter()
  const queryClient = useQueryClient()
  const commitMessage = useCommitMessage(initial.collection.allowCustomMessage)
  const fields = useMemo(
    () =>
      Array.isArray(initial.collection.fields)
        ? initial.collection.fields.filter(isContentField)
        : [],
    [initial.collection.fields],
  )

  const [messagePending, setMessagePending] = useState(false)
  const requestLock = useRef(false)
  const collectionHref = `/github/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/${encodeURIComponent(coordinates.branch)}/collection/${encodeURIComponent(coordinates.name)}`
  const [locale, setLocale] = useState(
    initial.collection.locale ?? initial.collection.i18n?.default ?? '',
  )
  const localizationSchema = {
    i18n: initial.collection.i18n,
    fields,
    localized: initial.collection.localized,
    list: initial.collection.list,
  }
  const creationParent = parent || initial.collection.path
  const initialValue = useMemo(
    () => ({
      content:
        initial.collection.i18n?.scheme === 'fields'
          ? initial.collection.list && !initial.collection.localized
            ? ([] as JsonValue[])
            : initial.collection.localized
              ? {}
              : initializeStructuredContent(fields)
          : initial.collection.list
            ? ([] as JsonValue[])
            : initializeStructuredContent(fields),
      source: '',
      filename: '',
    }),
    [initial.collection.list, fields],
  )
  const draft = useContentDraft({
    target: {
      ...coordinates,
      parent: creationParent,
      ...(initial.collection.i18n?.scheme === 'files' ? { locale } : {}),
    },
    schema: initial.collection.i18n
      ? {
          fields: initial.collection.fields,
          i18n: initial.collection.i18n,
          localized: initial.collection.localized,
        }
      : (initial.collection.fields ?? []),
    initialValue,
    initialSha: null,
    title: (value) =>
      fields.length
        ? getEntryTitle({
            content: value.content,
            filename: value.filename || remainingT({ message: 'New entry' }),
            primaryField: initial.collection.primaryField,
            schema: initial.collection,
          })
        : value.filename || initial.collection.label,
  })
  const draftValue = draft.value
  const { content, source, filename } = draftValue
  const setContent = (
    value:
      | JsonObject
      | JsonValue[]
      | ((current: JsonObject | JsonValue[]) => JsonObject | JsonValue[]),
  ) =>
    draft.setValue((current) => ({
      ...current,
      content: typeof value === 'function' ? value(current.content) : value,
    }))
  const setSource = (value: string) =>
    draft.setValue((current) => ({ ...current, source: value }))
  const setFilename = (value: string) =>
    draft.setValue((current) => ({ ...current, filename: value }))
  const mutation = useContentMutation<
    | Awaited<ReturnType<typeof createStructuredCollectionEntry>>
    | Awaited<ReturnType<typeof createRawCollectionEntry>>
  >()
  const activity = useContentActivity(coordinates, draft.session?.key)
  const saving = messagePending || activity.pending
  useUnsavedWarning(draft.dirty || saving)
  const error = mutation.error ?? activity.error
  const validation = useFieldValidation(
    fields,
    initial.media,
    initial.collection.list,
    error,
    initial.collection.i18n?.scheme === 'fields'
      ? localizationSchema
      : undefined,
  )
  const breadcrumb = buildEntryBreadcrumb({
    creationParent,
    currentLabel: remainingT({ message: 'New entry' }),
    groupTrail: initial.collection.groupTrail,
    rootPath: initial.collection.rootPath,
    schemaLabel: initial.collection.label,
    schemaType: 'collection',
  })

  async function createEntry() {
    if (requestLock.current || activity.pending || !draft.session) return
    if (
      fields.length &&
      !validation.validate(draft.session.getSnapshot().value.content)
    )
      return
    requestLock.current = true
    setMessagePending(true)
    const session = draft.session
    const origin = router.state.location.href
    try {
      const message = await commitMessage.request()
      if (message === null) return
      const submitted = session.getSnapshot().value
      if (fields.length && !validation.validate(submitted.content)) return
      const input = {
        message,
        ...coordinates,
        parent: creationParent,
        locale,
        ...(initial.collection.filenameField
          ? { filename: submitted.filename }
          : {}),
      }
      await mutation.run({
        id: session.key,
        coordinates,
        parent: creationParent,
        kind: 'create',
        handledError: (failure) => draft.reportSaveError(failure),
        locale: locale || undefined,
        title: getEntryTitle({
          content: submitted.content,
          filename: submitted.filename || remainingT({ message: 'New entry' }),
          primaryField: initial.collection.primaryField,
          schema: initial.collection,
        }),
        fields: fields.length ? submitted.content : undefined,
        expectedAccount: session.summary.account,
        retain: () => session.retain(),
        prepare: () => session.flushForSave(),
        run: () =>
          fields.length
            ? createStructuredCollectionEntry({
                ...input,
                repoId: session.summary.target.repoId,
                content: submitted.content,
              })
            : createRawCollectionEntry({
                ...input,
                repoId: session.summary.target.repoId,
                source: submitted.source,
              }),
        confirmed: async (result, isActiveAccount) => {
          if (isActiveAccount())
            confirmContentWrite(queryClient, coordinates, result)
          if (isActiveAccount()) refreshContent(queryClient, coordinates)
          if (isActiveAccount() && router.state.location.href === origin)
            await router.navigate({
              href: result.entry
                ? `${collectionHref}/entry/${result.path.split('/').map(encodeURIComponent).join('/')}${locale ? '?locale=' + encodeURIComponent(locale) : ''}`
                : collectionHref,
            })
          await session.saved(submitted)
          await recordOpened({
            ...session.summary,
            key: contentDraftKey(
              session.summary.account,
              session.summary.source,
              {
                ...coordinates,
                repoId: session.summary.target.repoId,
                path: result.path,
              },
            ),
            target: {
              ...coordinates,
              repoId: session.summary.target.repoId,
              path: result.path,
            },
            title: getEntryTitle({
              content:
                result.entry && result.entry.mode !== 'raw'
                  ? result.entry.content
                  : submitted.content,
              filename: result.path.split('/').at(-1)!,
              primaryField:
                result.entry?.primaryField ?? initial.collection.primaryField,
              schema: initial.collection,
              locale,
            }),
            href: `${collectionHref}/entry/${result.path.split('/').map(encodeURIComponent).join('/')}${locale ? '?locale=' + encodeURIComponent(locale) : ''}`,
            updatedAt: Date.now(),
          })
        },
      })
    } catch (cause) {
      validation.accept(cause)
      /* Recovery remains in the draft and mutation cache. */
    } finally {
      requestLock.current = false
      setMessagePending(false)
    }
  }

  const availableLocales =
    initial.collection.i18n?.scheme === 'fields'
      ? initial.collection.i18n.locales
          .filter((item) =>
            hasLocaleData(localizationSchema, content, item.code),
          )
          .map((item) => item.code)
      : []
  const localeSelection = useLocaleSelection({
    locale,
    locales: initial.collection.i18n?.locales ?? [],
    available: availableLocales,
    account: draft.session?.summary.account,
    ready: draft.ready,
    onSelect: setLocale,
    onStart:
      initial.collection.i18n?.scheme === 'fields'
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
    <form
      className="-m-4 md:-m-6"
      onSubmit={(event) => {
        event.preventDefault()
        void createEntry()
      }}
    >
      {localeSelection.dialog}
      <EntryPageHeader
        collectionHref={collectionHref}
        locale={locale || undefined}
        segments={breadcrumb}
        status={<DraftBadge draft={draft} busy={saving} />}
        actions={
          <>
            {initial.collection.i18n?.scheme === 'fields' ? (
              <LocaleMenu
                locale={locale}
                locales={initial.collection.i18n.locales}
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
                errors={[
                  ...new Set(
                    validation.issues
                      .map((issue) =>
                        issueLocale(localizationSchema, content, issue.path),
                      )
                      .filter((code): code is string => Boolean(code)),
                  ),
                ]}
                onCopy={(sourceLocale, replace) =>
                  setContent(
                    (current) =>
                      copyLocale(
                        localizationSchema,
                        current,
                        sourceLocale,
                        locale,
                        replace,
                      ) as typeof current,
                  )
                }
              />
            ) : initial.collection.i18n ? (
              <span className="text-sm text-muted-foreground">
                {
                  initial.collection.i18n.locales.find(
                    (item) => item.code === locale,
                  )?.label
                }
              </span>
            ) : null}
            <Button
              aria-label={_t({ message: 'Cancel' })}
              className="max-md:size-8 max-md:p-0"
              type="button"
              variant="outline"
              onClick={() =>
                void router.navigate({
                  href:
                    collectionHref +
                    (locale ? '?locale=' + encodeURIComponent(locale) : ''),
                })
              }
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={X}
                className="md:hidden"
              />
              <span className="hidden md:inline">
                <UiTrans>Cancel</UiTrans>
              </span>
            </Button>
            <DraftSaveButton
              draft={draft}
              busy={saving}
              label={_t({ message: 'Create entry' })}
              requireChanges={false}
              onSave={() => void createEntry()}
            />
          </>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        {commitMessage.dialog}
        {draft.ready ? (
          <LocaleContext.Provider
            value={
              initial.collection.i18n?.scheme === 'fields'
                ? {
                    locale,
                    locales: initial.collection.i18n.locales,
                    defaultLocale: initial.collection.i18n.default,
                    onSelect: localeSelection.select,
                  }
                : null
            }
          >
            <FieldValidationProvider validation={validation}>
              <FieldGroup ref={validation.root}>
                <FieldError errors={validation.unrenderedIssues} />
                {initial.collection.filenameField ? (
                  <Field>
                    <FieldLabel htmlFor="new-entry-filename">
                      <UiTrans>Filename</UiTrans>
                    </FieldLabel>
                    <Input
                      autoFocus
                      disabled={saving}
                      id="new-entry-filename"
                      required
                      value={filename}
                      onChange={(event) => setFilename(event.target.value)}
                    />
                  </Field>
                ) : null}

                {fields.length ? (
                  initial.collection.localized ? (
                    <StructuredContentField
                      field={{
                        name: 'translations',
                        label: false,
                        type: 'object',
                        fields,
                        localized: true,
                        ...(initial.collection.list
                          ? { list: initial.collection.list }
                          : {}),
                      }}
                      inheritedReadonly={saving}
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
                  ) : initial.collection.list ? (
                    <StructuredContentField
                      field={{
                        name: 'items',
                        label: false,
                        type: 'object',
                        fields,
                        list: initial.collection.list,
                      }}
                      inheritedReadonly={saving}
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
                          inheritedReadonly={saving}
                          referenceContext={{
                            ...coordinates,
                            locale,
                            media: initial.media,
                          }}
                          value={
                            Array.isArray(content) ? undefined : content[name]
                          }
                          onChange={(value: JsonValue | undefined) => {
                            setContent((current) => {
                              const next = Array.isArray(current)
                                ? {}
                                : { ...current }
                              if (value === undefined) delete next[name]
                              else next[name] = value
                              return next
                            })
                          }}
                        />
                      )
                    })
                  )
                ) : (
                  <Field>
                    <FieldLabel htmlFor="new-entry-content">
                      <UiTrans>Content</UiTrans>
                    </FieldLabel>
                    <Textarea
                      autoFocus={!initial.collection.filenameField}
                      className="min-h-[calc(100vh-17rem)] font-mono"
                      id="new-entry-content"
                      disabled={saving}
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                    />
                  </Field>
                )}
              </FieldGroup>
            </FieldValidationProvider>
          </LocaleContext.Provider>
        ) : (
          <ContentEntryFieldsSkeleton
            fields={
              initial.collection.list || initial.collection.localized
                ? undefined
                : [
                    ...(initial.collection.filenameField
                      ? [
                          {
                            name: 'filename',
                            label: _t({ message: 'Filename' }),
                          },
                        ]
                      : []),
                    ...(fields.length
                      ? fields
                      : [
                          {
                            name: 'content',
                            type: 'text',
                            label: _t({ message: 'Content' }),
                          },
                        ]),
                  ]
            }
          />
        )}
      </div>
    </form>
  )
}
