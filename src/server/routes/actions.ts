import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { validatedRead, validatedWrite } from './shared'
import {
  actionCoordinates,
  dispatchRequest,
  managementRequest,
  trackedActionsRequest,
} from '#/shared/requests/action'
import {
  readActions,
  runRepositoryAction,
  manageActionRun,
} from '#/server/services/actions'

const router = new Hono<ApiEnvironment>()

router.post(
  '/api/action-runs',
  validatedWrite(dispatchRequest, runRepositoryAction),
)

router.patch(
  '/api/action-runs',
  validatedWrite(managementRequest, manageActionRun),
)

router.post(
  '/api/actions/statuses',
  validatedWrite(trackedActionsRequest, async (services, user, refs) =>
    Promise.all(
      refs.map(async (ref) => ({
        ...ref,
        runs: (await readActions(services, user, ref)).runs,
      })),
    ),
  ),
)

router.get(
  '/api/actions',
  validatedRead((input) => {
    const query = input as Record<string, string | undefined>
    if (
      query.includeRuns !== undefined &&
      query.includeRuns !== 'true' &&
      query.includeRuns !== 'false'
    )
      throw new Error('Invalid action request')
    return {
      ...actionCoordinates(query),
      includeRuns: query.includeRuns !== 'false',
    }
  }, readActions),
)

export default router
