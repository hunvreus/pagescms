import { RequestTooLarge } from '#/server/request-body'
import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { validatedRead, validatedWrite, readRequestJson } from './shared'
import { localAccountsRequest } from '#/shared/requests/local-account'
import { deletedLocalAccounts } from '#/server/services/local-account-data'
import {
  parseProfileMutation,
  parseAccountDeletion,
  parseAccountId,
} from '#/shared/requests/account'
import { parsePreferencesUpdate } from '#/shared/account-preferences'
import {
  readSettings,
  saveProfile,
  deleteAccount,
  readPreferences,
  savePreferences,
} from '#/server/services/account'
import { parseLanguageUpdate } from '#/shared/requests/ui-language'
import { saveAccountLanguage } from '#/server/services/account-language'
import { sameOriginRequest } from '#/server/csrf'

const router = new Hono<ApiEnvironment>()

router.get(
  '/api/account/settings',
  validatedRead(() => undefined, readSettings),
)

router.patch(
  '/api/account',
  validatedWrite(parseProfileMutation, saveProfile, true),
)

router.delete(
  '/api/account',
  validatedWrite(parseAccountDeletion, deleteAccount),
)

router.get(
  '/api/account/preferences',
  validatedRead(parseAccountId, readPreferences),
)

router.patch(
  '/api/account/preferences',
  validatedWrite(parsePreferencesUpdate, savePreferences, true),
)

router.post('/api/account/deleted-local', async (context) => {
  if (!sameOriginRequest(context.req.raw, context.env.publicBaseUrl))
    return Response.json({ code: 'forbidden' }, { status: 403 })
  const parsed = localAccountsRequest.safeParse(
    await readRequestJson(context.req.raw).catch((error: unknown) => {
      if (error instanceof RequestTooLarge) throw error
      return null
    }),
  )
  if (!parsed.success)
    return Response.json({ code: 'invalid_request' }, { status: 400 })
  const services = context.env.getServices()
  return Response.json(
    await deletedLocalAccounts(
      services.database,
      services.configuration.auth.secret,
      parsed.data.receipts,
    ),
    { headers: { 'cache-control': 'no-store' } },
  )
})

router.patch('/api/account/language', async (context) => {
  if (!sameOriginRequest(context.req.raw, context.env.publicBaseUrl))
    return Response.json({ code: 'forbidden' }, { status: 403 })
  let input: ReturnType<typeof parseLanguageUpdate>
  try {
    input = parseLanguageUpdate(await readRequestJson(context.req.raw))
  } catch (error) {
    if (error instanceof RequestTooLarge) throw error
    return Response.json({ code: 'invalid_request' }, { status: 400 })
  }
  const services = context.env.getServices()
  const session = await services.getSession()
  if (!session?.user || session.user.id !== input.accountId)
    return Response.json({ code: 'account_changed' }, { status: 409 })
  const result = await saveAccountLanguage(services, input)
  await services.refreshSession()
  return Response.json(result, {
    headers: { 'cache-control': 'no-store' },
  })
})

export default router
