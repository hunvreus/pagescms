import type { I18n } from '@lingui/core'

/** Static plugin chrome; repository-authored labels remain literal strings. */
export type UiMessage = string | { id: string; message?: string }

export function isUiMessage(
  value: unknown,
  namespace: string,
): value is UiMessage {
  if (typeof value === 'string') return Boolean(value.trim())
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const descriptor = value as Record<string, unknown>
  return (
    typeof descriptor.id === 'string' &&
    descriptor.id.startsWith(`${namespace}.`) &&
    descriptor.id.length > namespace.length + 1 &&
    (descriptor.message === undefined ||
      typeof descriptor.message === 'string') &&
    Object.keys(descriptor).every((key) =>
      ['id', 'message', 'comment'].includes(key),
    )
  )
}

export function translateMessage(
  i18n: I18n | undefined,
  message: UiMessage,
): string {
  return typeof message === 'string'
    ? message
    : i18n
      ? i18n._(message)
      : (message.message ?? message.id)
}
