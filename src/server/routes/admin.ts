import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { validatedRead, validatedWrite } from './shared'
import {
  parseAdminSearch,
  parseAdminAction,
  parseAllowlistSearch,
  parseAllowlistAction,
} from '#/shared/requests/admin'
import {
  readAdminDashboard,
  executeAdminAction,
  readSignInAllowlist,
  changeSignInAllowlist,
} from '#/server/services/admin'

const router = new Hono<ApiEnvironment>()

router.get(
  '/api/admin/allowlist',
  validatedRead(parseAllowlistSearch, readSignInAllowlist),
)
router.post(
  '/api/admin/allowlist',
  validatedWrite(parseAllowlistAction, changeSignInAllowlist),
)

router.get(
  '/api/admin/dashboard',
  validatedRead((input) => {
    const query = input as Record<string, string | undefined>
    return parseAdminSearch({
      ...query,
      page: query.page === undefined ? undefined : Number(query.page),
      repoPage:
        query.repoPage === undefined ? undefined : Number(query.repoPage),
    })
  }, readAdminDashboard),
)

router.post(
  '/api/admin/actions',
  validatedWrite(parseAdminAction, executeAdminAction),
)

export default router
