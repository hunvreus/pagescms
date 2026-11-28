import type { JsonObject } from '#/shared/json'

export function isContentField(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
