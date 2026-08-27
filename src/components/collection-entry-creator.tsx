import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { LoaderCircle, Plus } from 'lucide-react'

import {
  StructuredContentField,
  isContentField,
} from '#/components/structured-content-field'
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
import { queryKeys } from '#/queries/keys'

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
  const fields = useMemo(
    () =>
      Array.isArray(initial.collection.fields)
        ? initial.collection.fields.filter(isContentField)
        : [],
    [initial.collection.fields],
  )
  const [content, setContent] = useState<JsonObject | JsonValue[]>(
    initial.collection.list ? [] : initializeStructuredContent(fields),
  )
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const collectionHref = `/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/${encodeURIComponent(coordinates.branch)}/collection/${encodeURIComponent(coordinates.name)}`
  const creationParent = parent || initial.collection.path
  const breadcrumb = buildEntryBreadcrumb({
    creationParent,
    currentLabel: 'New entry',
    groupTrail: initial.collection.groupTrail,
    rootPath: initial.collection.rootPath,
    schemaLabel: initial.collection.label,
    schemaType: 'collection',
  })

  async function createEntry() {
    setSaving(true)
    setError(null)
    try {
      const input = {
        ...coordinates,
        parent: creationParent,
        ...(initial.collection.filenameField ? { filename } : {}),
      }
      const result = fields.length
        ? await createStructuredCollectionEntry({
            data: { ...input, content },
          })
        : await createRawCollectionEntry({
            data: { ...input, source },
          })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(coordinates),
      })
      await router.navigate({
        href: `${collectionHref}/entry/${result.path.split('/').map(encodeURIComponent).join('/')}`,
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
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
            <Button disabled={saving} type="submit">
              {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {saving ? 'Creating' : 'Create entry'}
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <OperationError error={error} fallback="Could not create entry." />
        <FieldGroup>
          {initial.collection.filenameField ? (
            <Field>
              <FieldLabel htmlFor="new-entry-filename">Filename</FieldLabel>
              <Input
                autoFocus
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
                    referenceContext={{ ...coordinates, media: initial.media }}
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
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </Field>
          )}
        </FieldGroup>
      </div>
    </form>
  )
}
