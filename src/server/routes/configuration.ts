import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { pagedQuery, validatedRead, validatedWrite } from './shared'
import {
  configurationCoordinates,
  configurationSave,
  configurationHistory,
} from '#/shared/requests/configuration'
import {
  readConfiguration,
  writeConfiguration,
  readConfigurationHistory,
} from '#/server/services/configuration'

const router = new Hono<ApiEnvironment>()

router.get(
  '/api/configuration',
  validatedRead(configurationCoordinates, readConfiguration),
)

router.get(
  '/api/configuration/history',
  validatedRead(
    (query) => configurationHistory(pagedQuery(query)),
    readConfigurationHistory,
  ),
)

router.post(
  '/api/configuration',
  validatedWrite(configurationSave, writeConfiguration),
)

export default router
