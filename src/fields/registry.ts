import type { JsonObject, JsonValue } from '#/lib/json'

export interface FieldDefinition {
  label?: string
  schema?: (field: JsonObject) => {
    safeParse: (value: unknown) => {
      success: boolean
      data?: unknown
      error?: { issues: readonly { message: string }[] }
    }
  }
  defaultValue?: (field: JsonObject) => JsonValue
  read?: (
    value: JsonValue | undefined,
    field: JsonObject,
  ) => JsonValue | undefined
  write?: (
    value: JsonValue | undefined,
    field: JsonObject,
  ) => JsonValue | undefined
}

const modules = import.meta.glob<FieldDefinition>('./custom/*/index.{ts,tsx}', {
  eager: true,
})
const definitions = new Map(
  Object.entries(modules).map(([path, definition]) => [
    path.split('/')[2],
    definition,
  ]),
)

export function customFieldDefinition(type: string) {
  return definitions.get(type)
}
