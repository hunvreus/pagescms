import { useEffect } from 'react'
import { useLingui } from '@lingui/react'
import { pageTitle } from '#/lib/page-title'
import { translateMessage } from './message'
import type { UiMessage } from './message'

/** Route head handles SSR; activation updates the title without reloading route data. */
export function DocumentTitle({
  message,
  repository,
}: {
  message: UiMessage
  repository?: { owner: string; repo: string; branch?: string }
}) {
  const { i18n } = useLingui()
  const title = pageTitle(translateMessage(i18n, message), repository).meta[0]
    .title
  useEffect(() => {
    document.title = title
  }, [title])
  return null
}
