// @vitest-environment jsdom
import { setupI18n } from '@lingui/core'
import { expect, it, vi } from 'vitest'
import { messages } from '../locales/fr/messages.po'
import { bindBrowserI18n, registerErrorTranslations } from '#/i18n/errors'
import { errors } from '#/i18n/known-errors'
import { toast } from './notifications'

const loading = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { loading }) }))

it('translates workflow notices and action labels while preserving handlers', () => {
  const i18n = setupI18n({ locale: 'fr', messages: { fr: messages } })
  registerErrorTranslations(i18n, errors)
  bindBrowserI18n(i18n)
  const cancel = vi.fn()
  toast.loading('“Build site” is running', {
    action: { label: 'Cancel', onClick: cancel },
  })
  expect(loading).toHaveBeenCalledWith(
    '« Build site » est en cours',
    expect.objectContaining({
      action: { label: 'Annuler', onClick: cancel },
    }),
  )
})
