import { structuredContentIssues, structuredListIssues } from './field-values'
import { mediaFieldIssues } from './media-field-values'
import { contentI18n, record } from './i18n'
import type { FieldMediaSchema } from './media-field-values'
import type { JsonObject, JsonValue } from '#/shared/json'

export function contentValidationIssues(
  fields: unknown[],
  content: JsonObject | JsonValue[],
  media: FieldMediaSchema[],
  list: unknown = true,
) {
  return [
    ...(Array.isArray(content)
      ? structuredListIssues(fields, content, list)
      : structuredContentIssues(fields, content)),
    ...mediaFieldIssues(fields, content, media),
  ]
}

/** Unknown locale keys remain in the document but are not edited or validated. */
export function localizedContentIssues(
  schema: Record<string, unknown>,
  content: JsonObject | JsonValue[],
  media: FieldMediaSchema[],
) {
  const codes = contentI18n(schema)?.locales.map((item) => item.code)
  const decorate = (
    node: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...node,
    ...(node.localized ? { _localeCodes: codes } : {}),
    ...(Array.isArray(node.fields)
      ? {
          fields: node.fields.map((field) =>
            record(field) ? decorate(field) : field,
          ),
        }
      : {}),
    ...(Array.isArray(node.blocks)
      ? {
          blocks: node.blocks.map((block) =>
            record(block) ? decorate(block) : block,
          ),
        }
      : {}),
  })
  const fields = (Array.isArray(schema.fields) ? schema.fields : []).map(
    (field) => (record(field) ? decorate(field) : field),
  )
  if (schema.localized === true)
    return contentValidationIssues(
      [
        {
          name: 'translations',
          type: 'object',
          fields,
          list: schema.list,
          localized: true,
          _requireTranslation: true,
          _localeCodes: codes,
        },
      ],
      { translations: content },
      media,
    )
  return contentValidationIssues(fields, content, media, schema.list)
}
