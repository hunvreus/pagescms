import { contentDraftKey, recordOpened } from '#/features/drafts/draft-store'
import {
  confirmContentWrite,
  refreshContent,
  useContentActivity,
  useContentMutation,
} from '#/features/content/content-mutations'
import { getEntryTitle } from '#/features/editor/entry-title'
import { useCommitMessage } from '#/features/editor/commit-message-dialog'
import { useContentDraft } from '#/features/drafts/use-content-draft'
import {
  ContentDraftRecovery,
  ContentDraftIndicator,
} from '#/features/drafts/content-draft-status'
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { LoaderCircle, Plus } from 'lucide-react'

import { StructuredContentField } from '#/components/structured-content-field'
import { isContentField } from '#/lib/content-field'
import { OperationError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { buildEntryBreadcrumb } from '#/features/editor/entry-breadcrumb'
import { EntryPageHeader } from '#/features/editor/entry-page-header'
import type { getCollection } from '#/functions/collection'
import {
  createRawCollectionEntry,
  createStructuredCollectionEntry,
} from '#/functions/entry-editor'
import { initializeStructuredContent } from '#/lib/field-values'

import type { JsonObject, JsonValue } from '#/lib/json'

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
  const collectionHref = `/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/${encodeURIComponent(coordinates.branch)}/collection/${encodeURIComponent(coordinates.name)}`
  const creationParent = parent || initial.collection.path
  const initialValue = useMemo(
    () => ({
      content: initial.collection.list
        ? ([] as JsonValue[])
        : initializeStructuredContent(fields),
      source: '',
      filename: '',
    }),
    [initial.collection.list, fields],
  )
  const draft = useContentDraft({
    target: { ...coordinates, parent: creationParent },
    schema: initial.collection.fields ?? [],
    initialValue,
    initialSha: null,
    title: (value) =>
      fields.length
        ? getEntryTitle({
            content: value.content,
            filename: value.filename || 'New entry',
            primaryField: initial.collection.primaryField,
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
  const error = mutation.error ?? activity.error
  const breadcrumb = buildEntryBreadcrumb({
    creationParent,
    currentLabel: 'New entry',
    groupTrail: initial.collection.groupTrail,
    rootPath: initial.collection.rootPath,
    schemaLabel: initial.collection.label,
    schemaType: 'collection',
  })

  async function createEntry() {
    if (requestLock.current || activity.pending || !draft.session) return
    requestLock.current = true
    setMessagePending(true)
    const session = draft.session
    const origin = router.state.location.href
    try {
      const message = await commitMessage.request()
      if (message === null) return
      const submitted = session.getSnapshot().value
      const input = {
        message,
        ...coordinates,
        parent: creationParent,
        ...(initial.collection.filenameField
          ? { filename: submitted.filename }
          : {}),
      }
      await mutation.run({
        id: session.key,
        coordinates,
        parent: creationParent,
        kind: 'create',
        title: getEntryTitle({
          content: submitted.content,
          filename: submitted.filename || 'New entry',
          primaryField: initial.collection.primaryField,
        }),
        fields: fields.length ? submitted.content : undefined,
        expectedAccount: session.summary.account,
        retain: () => session.retain(),
        prepare: () => session.flush(),
        run: () =>
          fields.length
            ? createStructuredCollectionEntry({
                data: { ...input, content: submitted.content },
              })
            : createRawCollectionEntry({
                data: { ...input, source: submitted.source },
              }),
        confirmed: async (result, isActiveAccount) => {
          if (isActiveAccount())
            confirmContentWrite(queryClient, coordinates, result)
          if (isActiveAccount()) refreshContent(queryClient, coordinates)
          if (isActiveAccount() && router.state.location.href === origin)
            await router.navigate({
              href: result.entry
                ? `${collectionHref}/entry/${result.path.split('/').map(encodeURIComponent).join('/')}`
                : collectionHref,
            })
          await session.saved(submitted)
          await recordOpened({
            ...session.summary,
            key: contentDraftKey(
              session.summary.account,
              session.summary.source,
              { ...coordinates, path: result.path },
            ),
            target: { ...coordinates, path: result.path },
            title: getEntryTitle({
              content:
                result.entry && result.entry.mode !== 'raw'
                  ? result.entry.content
                  : submitted.content,
              filename: result.path.split('/').at(-1)!,
              primaryField:
                result.entry?.primaryField ?? initial.collection.primaryField,
            }),
            href: `${collectionHref}/entry/${result.path.split('/').map(encodeURIComponent).join('/')}`,
            updatedAt: Date.now(),
          })
        },
      })
    } catch {
      /* Recovery remains in the draft and mutation cache. */
    } finally {
      requestLock.current = false
      setMessagePending(false)
    }
  }

  return (
    <form
      className="-m-4 md:-m-6"
      onSubmit={(event) => {
        event.preventDefault()
        void createEntry()
      }}
    >
      <EntryPageHeader
        collectionHref={collectionHref}
        segments={breadcrumb}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void router.navigate({ href: collectionHref })}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <ContentDraftIndicator draft={draft} saving={saving} />
              <Button disabled={saving || !draft.ready} type="submit">
                {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
                {saving ? 'Creating' : 'Create entry'}
              </Button>
            </div>
          </>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <OperationError error={error} fallback="Could not create entry." />
        <ContentDraftRecovery draft={draft} />
        {commitMessage.dialog}
        {draft.ready ? (
          <FieldGroup>
            {initial.collection.filenameField ? (
              <Field>
                <FieldLabel htmlFor="new-entry-filename">Filename</FieldLabel>
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
              initial.collection.list ? (
                <StructuredContentField
                  field={{
                    name: 'items',
                    label: false,
                    type: 'object',
                    fields,
                    list: initial.collection.list,
                  }}
                  inheritedReadonly={saving}
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
                      inheritedReadonly={saving}
                      referenceContext={{
                        ...coordinates,
                        media: initial.media,
                      }}
                      value={Array.isArray(content) ? undefined : content[name]}
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
                <FieldLabel htmlFor="new-entry-content">Content</FieldLabel>
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
        ) : null}
      </div>
    </form>
  )
}
