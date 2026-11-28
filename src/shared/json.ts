export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }
export type ReadonlyJsonValue =
  JsonPrimitive | ReadonlyJsonObject | readonly ReadonlyJsonValue[]
export type ReadonlyJsonObject = { readonly [key: string]: ReadonlyJsonValue }

export function freezeJson<T extends JsonValue>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child)
    Object.freeze(value)
  }
  return value
}

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export function toJsonObject(value: unknown): JsonObject {
  const parsed: unknown = toJsonValue(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object')
  }
  return parsed as JsonObject
}
