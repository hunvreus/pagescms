import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { validatedRead, validatedWrite } from './shared'
import { mediaPreviewResponse } from '#/server/media/preview'
import {
  parseMediaRequest,
  parseMediaDeliveryRequest,
  parseMediaUpload,
  parseMediaDelete,
  parseMediaUploadInitiation,
  parseMediaUploadCompletion,
  parseMediaUploadAbort,
  parseMediaFolderCreate,
  parseMediaRename,
  parseMediaMove,
} from '#/shared/requests/media'
import {
  readMediaDirectory,
  readMediaDelivery,
  uploadMediaFile,
  deleteMediaFile,
  initiateMediaUpload,
  confirmMediaUpload,
  abortMediaUpload,
  createMediaFolder,
  renameMedia,
  moveMedia,
} from '#/server/services/media'

const router = new Hono<ApiEnvironment>()

router.get('/api/media-preview/:owner/:repo/:branch/:name/*', (context) => {
  let path: string
  try {
    path = decodeURIComponent(
      new URL(context.req.url).pathname.split('/').slice(7).join('/'),
    )
  } catch {
    return Response.json({ error: 'Invalid media path' }, { status: 400 })
  }
  const { owner, repo, branch, name } = context.req.param()
  return mediaPreviewResponse(context.req.raw, context.env.getServices(), {
    owner,
    repo,
    branch,
    name,
    _splat: path,
  })
})

router.post(
  '/api/media/delivery',
  validatedWrite(parseMediaDeliveryRequest, readMediaDelivery),
)

router.post(
  '/api/media/files',
  validatedWrite(parseMediaUpload, uploadMediaFile),
)

router.post(
  '/api/media/uploads',
  validatedWrite(parseMediaUploadInitiation, initiateMediaUpload),
)

router.patch(
  '/api/media/uploads',
  validatedWrite(parseMediaUploadCompletion, confirmMediaUpload),
)

router.delete(
  '/api/media/uploads',
  validatedWrite(parseMediaUploadAbort, abortMediaUpload),
)

router.post(
  '/api/media/folders',
  validatedWrite(parseMediaFolderCreate, createMediaFolder),
)

router.delete(
  '/api/media/files',
  validatedWrite(parseMediaDelete, deleteMediaFile),
)

router.patch(
  '/api/media/files/name',
  validatedWrite(parseMediaRename, renameMedia),
)

router.patch('/api/media/files/path', validatedWrite(parseMediaMove, moveMedia))

router.get('/api/media', validatedRead(parseMediaRequest, readMediaDirectory))

export default router
