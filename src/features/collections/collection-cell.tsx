import { Calendar } from 'lucide-react'
import { Suspense } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { marked } from 'marked'

import { Badge } from '#/components/ui/badge'
import { MediaThumbnail } from '#/components/media-thumbnail'
import { mediaInputPath, resolveFieldMedia } from '#/lib/media-field-values'
import { parseFieldDate } from '#/lib/date-field'
import { customFieldViews } from '#/features/editor/fields/custom-field-components'

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

function stripHtml(text: string) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectInlineText(tokens: unknown[]): string {
  const parts: string[] = []
  for (const token of tokens as Array<Record<string, unknown>>) {
    const type = token.type
    if (typeof type !== 'string') continue
    if (type === 'text' || type === 'escape' || type === 'codespan') {
      if (typeof token.text === 'string') parts.push(token.text)
      continue
    }
    if (type === 'image') {
      if (typeof token.text === 'string' && token.text.trim()) {
        parts.push(token.text)
      }
      continue
    }
    if (Array.isArray(token.tokens)) {
      parts.push(collectInlineText(token.tokens))
    } else if (typeof token.text === 'string') {
      parts.push(token.text)
    }
  }
  return parts.join(' ')
}

export function markdownToPlainText(input: string): string {
  try {
    const parts: string[] = []
    for (const token of marked.lexer(input, { gfm: true }) as Array<
      Record<string, unknown>
    >) {
      const type = token.type
      if (type === 'space' || type === 'hr') continue
      if (type === 'code' && typeof token.text === 'string') {
        parts.push(token.text)
      } else if (type === 'html' && typeof token.raw === 'string') {
        parts.push(stripHtml(token.raw))
      } else if (type === 'table' && Array.isArray(token.header)) {
        parts.push(collectInlineText(token.header))
        if (Array.isArray(token.rows)) {
          for (const row of token.rows) {
            if (Array.isArray(row)) parts.push(collectInlineText(row))
          }
        }
      } else if (Array.isArray(token.tokens)) {
        parts.push(collectInlineText(token.tokens))
      } else if (typeof token.text === 'string') {
        parts.push(token.text)
      } else if (typeof token.raw === 'string') {
        parts.push(token.raw)
      }
    }
    return stripHtml(parts.join(' '))
  } catch {
    return stripHtml(input)
  }
}

export function collectionReferenceValues(value: JsonValue | undefined) {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
      ? []
      : [value]
  return values
    .map((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        'value' in item
      ) {
        return String(item.value ?? '')
      }
      return typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
        ? String(item)
        : ''
    })
    .filter(Boolean)
}

function dateValue(
  value: JsonValue | undefined,
  field: CollectionColumn['field'],
) {
  const item = firstValue(value)
  if (typeof item !== 'string') return ''
  const parsed =
    parseFieldDate(item, field, true) ??
    new Date(/^\d{4}-\d{2}-\d{2}$/.test(item) ? `${item}T00:00:00` : item)
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
  referenceLabels,
}: {
  column: CollectionColumn
  value: JsonValue | undefined
  repository: RepositoryCoordinates
  media: MediaSchema[]
  referenceLabels?: ReadonlyMap<string, string>
}) {
  const CustomView = customFieldViews.get(column.type)
  if (CustomView)
    return (
      <ClientOnly fallback={textValue(value)}>
        <Suspense fallback={textValue(value)}>
          <CustomView field={column.field} value={value} />
        </Suspense>
      </ClientOnly>
    )
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
    const formatted = dateValue(value, column.field)
    return formatted ? (
      <Badge variant="secondary">
        <Calendar aria-hidden="true" />
        {formatted}
      </Badge>
    ) : null
  }

  if (column.type === 'reference') {
    const values = collectionReferenceValues(value)
    if (!values.length) return null
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge className="min-w-0 max-w-full" variant="secondary">
          <span className="truncate">
            {referenceLabels?.get(values[0]) ?? values[0]}
          </span>
        </Badge>
        {values.length > 1 ? (
          <Badge className="px-1" variant="secondary">
            +{values.length - 1}
          </Badge>
        ) : null}
      </span>
    )
  }

  if (column.type === 'rich-text') {
    const formatted = Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map(markdownToPlainText)
          .join(', ')
      : typeof value === 'string'
        ? markdownToPlainText(value)
        : ''
    return formatted ? (
      <span className="block truncate">{formatted}</span>
    ) : null
  }

  return <span className="block truncate">{textValue(value)}</span>
}
