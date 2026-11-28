import { useState } from 'react'
import { StartTranslationDialog } from './start-translation-dialog'
import { useAccountPreferences } from '#/features/account/use-account-preferences'
import type { Locale } from '#/lib/i18n'

export function useLocaleSelection({
  locale,
  locales,
  available,
  account,
  ready = true,
  onSelect,
  onStart,
}: {
  locale: string
  locales: Locale[]
  available?: string[]
  account?: string
  ready?: boolean
  onSelect: (code: string) => void
  onStart?: (code: string, copy: boolean) => void
}) {
  const preferences = useAccountPreferences(account)
  const [target, setTarget] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  return {
    select(code: string) {
      if (
        !ready ||
        !preferences.ready ||
        code === locale ||
        !locales.some((item) => item.code === code)
      )
        return
      if (onStart && available && !available.includes(code)) {
        const preference = preferences.editing.newTranslations
        if (preference !== 'ask') {
          onStart(code, preference === 'copy' && available.includes(locale))
          onSelect(code)
        } else {
          setTarget(code)
          setOpen(true)
        }
      } else onSelect(code)
    },
    dialog: onStart ? (
      <StartTranslationDialog
        open={open}
        onOpenChange={setOpen}
        language={locales.find((item) => item.code === target)?.label}
        source={locales.find((item) => item.code === locale)?.label ?? locale}
        account={account}
        canCopy={ready && Boolean(available?.includes(locale))}
        onStart={(copy) => {
          if (!target || !ready) return
          onStart(target, copy)
          onSelect(target)
          setOpen(false)
        }}
      />
    ) : null,
  }
}
