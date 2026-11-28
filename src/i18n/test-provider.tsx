import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { messages } from '../locales/en/messages.po'

export function TestI18n({ children }: { children: ReactNode }) {
  const [i18n] = useState(() =>
    setupI18n({ locale: 'en', messages: { en: messages } }),
  )
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>
}
