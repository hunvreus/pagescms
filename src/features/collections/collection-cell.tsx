import { Calendar } from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import { MediaThumbnail } from '#/components/media-thumbnail'
import { mediaInputPath, resolveFieldMedia } from '#/lib/media-field-values'

import type { CollectionColumn } from './collection-model'
import type { JsonValue } from '#/lib/json'

interface RepositoryCoordinates {
  owner: string
  repo: string
  branch: string
}

interface MediaSchema {
  name: string
  input: string
  output: string
  extensions: string[]
}

function firstValue(value: JsonValue | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function extraValueCount(value: JsonValue | undefined) {
  return Array.isArray(value) ? Math.max(0, value.length - 1) : 0
}

function textValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value))
    return value.map(textValue).filter(Boolean).join(', ')
  if (typeof value === 'object') return ''
  return String(value)
}

function dateValue(value: JsonValue | undefined) {
  const item = firstValue(value)
  if (typeof item !== 'string') return ''
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(item) ? `${item}T00:00:00` : item,
  )
  if (Number.isNaN(parsed.valueOf())) return item
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(item.includes('T') ? { timeStyle: 'short' } : {}),
  }).format(parsed)
}

export function CollectionCell({
  column,
  value,
  repository,
  media,
}: {
  column: CollectionColumn
  value: JsonValue | undefined
  repository: RepositoryCoordinates
  media: MediaSchema[]
}) {
  if (column.type === 'image') {
    const item = firstValue(value)
    const schema = resolveFieldMedia(column.field, media)
    if (!schema) return textValue(value)
    return (
      <span className="flex items-center gap-2">
        <MediaThumbnail
          {...repository}
          className="size-8"
          name={schema.name}
          path={typeof item === 'string' ? mediaInputPath(item, schema) : null}
        />
        {extraValueCount(value) ? (
          <span className="text-xs text-muted-foreground">
            +{extraValueCount(value)}
          </span>
        ) : null}
      </span>
    )
  }

  if (value === undefined || value === null || value === '') return null

  if (column.type === 'boolean') {
    const item = firstValue(value)
    if (typeof item !== 'boolean') return textValue(value)
    return <Badge variant="secondary">{item ? 'Yes' : 'No'}</Badge>
  }

  if (column.type === 'date' || column.type === 'datetime') {
    const formatted = dateValue(value)
    return formatted ? (
      <Badge variant="secondary">
        <Calendar aria-hidden="true" />
        {formatted}
      </Badge>
    ) : null
  }

  return <span className="block truncate">{textValue(value)}</span>
}
