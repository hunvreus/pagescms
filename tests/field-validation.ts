import type { JsonObject, JsonValue } from '#/shared/json'
import {
  structuredContentIssues,
  structuredListIssues,
} from '#/lib/field-values'
import { mediaFieldIssues } from '#/lib/media-field-values'
import type { FieldMediaSchema } from '#/lib/media-field-values'

export function validateStructuredContent(
  fields: unknown[],
  content: JsonObject,
  parentPath = '',
) {
  return structuredContentIssues(fields, content, parentPath).map(
    (issue) => issue.message,
  )
}

export function validateStructuredList(
  fields: unknown[],
  content: JsonValue[],
  list: unknown = true,
) {
  return structuredListIssues(fields, content, list).map((issue) =>
    issue.message.replace(
      /^items\.(\d+)/,
      (_match, index: string) => `Item ${Number(index) + 1}`,
    ),
  )
}

export function validateMediaFieldValues(
  fields: unknown[],
  content: JsonObject | JsonValue[],
  media: FieldMediaSchema[],
) {
  return mediaFieldIssues(fields, content, media).map((issue) =>
    issue.message.replace(
      /^items\.(\d+)/,
      (_match, index: string) => `Item ${Number(index) + 1}`,
    ),
  )
}
