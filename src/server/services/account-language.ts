import { updateAccountLanguage } from '#/server/account/preferences'
import type { RequestServices } from '#/server/context'
import type { parseLanguageUpdate } from '#/shared/requests/ui-language'

export async function saveAccountLanguage(
  services: RequestServices,
  data: ReturnType<typeof parseLanguageUpdate>,
) {
  const session = await services.getSession()
  if (!session?.user || session.user.id !== data.accountId)
    throw new Error('Your signed-in account changed. Reload and try again.')
  return services.access.execute(
    {
      operation: 'account.update',
      principal: { type: 'user', id: session.user.id },
      tenant: { type: 'account', id: session.user.id },
    },
    () =>
      updateAccountLanguage(services.database, session.user.id, data.language),
  )
}
