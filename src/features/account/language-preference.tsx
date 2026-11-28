import { notifyError } from '#/lib/notifications'
import { useEffect, useRef, useState } from 'react'
import { useLingui as useUiMessages } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { LanguageField } from './language-field'
import { activateLocale } from '#/i18n/catalogs'
import { isLocale, localeCookie } from '#/i18n/locale'
import { saveLanguage } from '#/client/api/account'
import { useOperation } from '#/features/pending-writes/use-operation'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { accountPreferencesQueryOptions } from './use-account-preferences'
import {
  accountSettingsQueryOptions,
  authenticationQueryOptions,
} from '#/client/queries/session'

export function LanguagePreference({
  accountId,
  anonymous = false,
}: {
  accountId?: string
  anonymous?: boolean
}) {
  const { i18n, t } = useUiMessages()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    setReady(true)
    return () => {
      mounted.current = false
    }
  }, [])
  const operation =
    useOperation<Awaited<ReturnType<typeof saveLanguage>>>('account-language')
  async function change(value: string) {
    if (!isLocale(value) || pending.current || (!accountId && !anonymous))
      return
    pending.current = true
    setBusy(true)
    const current = accountIsActive(client, accountId)
    let mutationStarted = false
    try {
      // Load the catalog before saving so a failed chunk download leaves the old preference intact.
      const { setupI18n } = await import('@lingui/core')
      const next = setupI18n()
      await activateLocale(next, value)
      if (accountId) {
        mutationStarted = true
        await operation.run({
          expectedAccount: accountId,
          failureMessage: t`Could not change language. Try again.`,
          run: () => saveLanguage({ accountId, language: value }),
          confirmed: (preferences, active) => {
            if (!active()) return
            void client.invalidateQueries({
              queryKey: authenticationQueryOptions().queryKey,
            })
            client.setQueryData(
              accountPreferencesQueryOptions(accountId).queryKey,
              (cached) => ({ ...cached, language: preferences.language }),
            )
            client.setQueryData(
              accountSettingsQueryOptions().queryKey,
              (cached) =>
                cached?.user.id === accountId
                  ? {
                      ...cached,
                      preferences: {
                        ...cached.preferences,
                        language: preferences.language,
                      },
                    }
                  : cached,
            )
          },
        })
      }
      if (accountId ? !current() : !mounted.current) return
      document.cookie = `${localeCookie}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      i18n.loadAndActivate({ locale: value, messages: next.messages })
    } catch (error) {
      if (!mutationStarted && mounted.current && (!accountId || current()))
        notifyError(error, t`Could not change language. Try again.`)
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <LanguageField
      anonymous={anonymous}
      disabled={!ready || busy || (!accountId && !anonymous)}
      busy={busy}
      onChange={(value) => void change(value)}
    />
  )
}
