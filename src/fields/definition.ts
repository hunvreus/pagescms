import type { JsonObject, JsonValue, ReadonlyJsonObject } from '#/shared/json'

export interface FieldDefinition {
  label?: string
  schema?: (field: JsonObject) => {
    safeParse: (value: unknown) => {
      success: boolean
      data?: unknown
      error?: { issues: readonly { message: string }[] }
    }
  }
  defaultValue?: JsonValue | ((field: JsonObject) => JsonValue)
  read?: (
    value: JsonValue | undefined,
    field: JsonObject,
    configuration?: ReadonlyJsonObject,
  ) => JsonValue | undefined
  write?: (
    value: JsonValue | undefined,
    field: JsonObject,
    configuration?: ReadonlyJsonObject,
  ) => JsonValue | undefined
}

export const BUILTIN_FIELD_TYPES = [
  'string',
  'text',
  'number',
  'boolean',
  'object',
  'block',
  'uuid',
  'date',
  'select',
  'reference',
  'image',
  'file',
  'rich-text',
  'code',
] as const

export interface FieldViewProps {
  field: JsonObject
  value: JsonValue | undefined
}
