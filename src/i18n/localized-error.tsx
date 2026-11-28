import { useLingui } from '@lingui/react'
import { localizeErrorMessage } from './errors'
/** Translate an app-owned diagnostic at render time, keeping canonical stored errors intact. */
export function LocalizedError({ message }: { message: string }) {
  const { i18n } = useLingui()
  return localizeErrorMessage(i18n, message)
}
