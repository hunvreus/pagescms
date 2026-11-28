import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { validatedRead, validatedWrite } from './shared'
import {
  coordinates as collaboratorCoordinates,
  inviteRequest,
  removeRequest,
} from '#/shared/requests/collaborator'
import {
  readCollaborators,
  addCollaborators,
  deleteCollaborator,
} from '#/server/services/collaborators'

const router = new Hono<ApiEnvironment>()

router.get(
  '/api/collaborators',
  validatedRead(collaboratorCoordinates, readCollaborators),
)

router.post(
  '/api/collaborators',
  validatedWrite(inviteRequest, addCollaborators),
)

router.delete(
  '/api/collaborators',
  validatedWrite(removeRequest, deleteCollaborator),
)

export default router
