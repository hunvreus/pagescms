import { toast } from 'sonner'
import {
  abortMediaUpload,
  confirmMediaUpload,
  createMedia,
  initiateMediaUpload,
} from '#/functions/media'

import type { MediaCoordinates } from './media-browser'
import type { UploadRename } from '#/lib/media-upload-name'

export const MEDIA_UPLOAD_LIMIT = 20 * 1024 * 1024

export function validateMediaUpload(
  file: Pick<File, 'name' | 'size'>,
  extensions?: string[],
) {
  if (file.size > MEDIA_UPLOAD_LIMIT)
    throw new Error(`${file.name} exceeds the 20 MB limit`)

  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  const allowed = extensions?.map((value) => value.toLowerCase())
  if (allowed?.length && !allowed.includes(extension))
    throw new Error(`${file.name} uses a disallowed file extension`)
}

export function mediaFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

async function requireUploadResponse(response: Response, label: string) {
  if (!response.ok)
    throw new Error(`${label} failed with status ${response.status}`)
  return response
}

const CONFIRMATION_RETRY_DELAYS_MS = [0, 500, 1_500] as const

async function confirmDirectUpload(
  data: MediaCoordinates & {
    path: string
    ticket: string
    parts?: { number: number; etag: string }[]
  },
  checkAccount: () => void,
) {
  let lastError: unknown
  for (const delay of CONFIRMATION_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
    checkAccount()
    try {
      return await confirmMediaUpload({ data })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function uploadDirectFile(
  file: File,
  direct: Extract<
    Awaited<ReturnType<typeof initiateMediaUpload>>,
    { kind: 'direct' }
  > & { coordinates: MediaCoordinates },
  checkAccount: () => void,
) {
  const { plan } = direct
  let completedParts: Array<{ number: number; etag: string }> | undefined
  try {
    checkAccount()
    if (plan.kind === 'post') {
      const form = new FormData()
      for (const [name, value] of Object.entries(plan.fields)) {
        form.append(name, value)
      }
      form.append('file', file, file.name)
      await requireUploadResponse(
        await fetch(plan.url, { method: 'POST', body: form }),
        file.name,
      )
    } else {
      const completed: Array<{ number: number; etag: string }> = []
      let next = 0
      const workers = Array.from(
        { length: Math.min(3, plan.parts.length) },
        async () => {
          while (next < plan.parts.length) {
            checkAccount()
            const part = plan.parts[next++]
            const start = (part.number - 1) * plan.partSize
            const response = await requireUploadResponse(
              await fetch(part.url, {
                method: 'PUT',
                body: file.slice(start, start + plan.partSize),
              }),
              `${file.name} part ${part.number}`,
            )
            const etag = response.headers.get('etag')
            if (!etag)
              throw new Error(
                `Upload response omitted the ETag for ${file.name}`,
              )
            completed.push({ number: part.number, etag })
          }
        },
      )
      await Promise.all(workers)
      completedParts = completed
    }
  } catch (error) {
    try {
      checkAccount()
      await abortMediaUpload({
        data: {
          ...direct.coordinates,
          path: direct.path,
          ticket: plan.ticket,
        },
      })
    } catch {
      // The provider lifecycle/reconciliation policy cleans abandoned uploads.
    }
    throw error
  }
  return confirmDirectUpload(
    {
      ...direct.coordinates,
      path: direct.path,
      ticket: plan.ticket,
      ...(completedParts ? { parts: completedParts } : {}),
    },
    checkAccount,
  )
}

export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly paths: string[],
  ) {
    super(message)
    this.name = 'MediaUploadError'
  }
}

export async function uploadMediaFiles({
  coordinates,
  extensions,
  files,
  limit,
  path,
  rename,
  onUploaded,
  isActive = () => true,
}: {
  coordinates: MediaCoordinates
  extensions?: string[]
  files: FileList | File[]
  limit?: number
  path: string
  rename?: UploadRename
  isActive?: () => boolean
  onUploaded?: (
    result: Awaited<ReturnType<typeof createMedia>>,
    file: File,
    index: number,
  ) => void
}) {
  const values = Array.from(files).slice(0, limit)
  const paths: string[] = []

  if (!values.length) return paths
  const notification = isActive()
    ? toast.loading(`Uploading 1 of ${values.length} files…`)
    : undefined
  const checkAccount = () => {
    if (!isActive())
      throw new Error('Upload stopped because the signed-in account changed.')
  }
  const dismiss = () => {
    if (notification !== undefined) toast.dismiss(notification)
  }
  try {
    for (const [index, file] of values.entries()) {
      checkAccount()
      toast.loading(`Uploading ${index + 1} of ${values.length} files…`, {
        id: notification,
      })
      validateMediaUpload(file, extensions)
      const idempotencyKey = crypto.randomUUID()
      const initiation = await initiateMediaUpload({
        data: {
          ...coordinates,
          path,
          filename: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          idempotencyKey,
          rename,
        },
      })
      checkAccount()
      if (initiation.kind === 'server') {
        const content = await mediaFileBase64(file)
        checkAccount()
        const result = await createMedia({
          data: {
            ...coordinates,
            path,
            filename: file.name,
            content,
            idempotencyKey,
            rename,
          },
        })
        paths.push(result.path)
        try {
          if (isActive()) onUploaded?.(result, file, index)
        } catch (error) {
          console.warn('Upload confirmed but local update failed', error)
        }
        continue
      }

      const result = await uploadDirectFile(
        file,
        {
          ...initiation,
          coordinates,
        },
        checkAccount,
      )
      paths.push(result.path)
      try {
        if (isActive()) onUploaded?.(result, file, index)
      } catch (error) {
        console.warn('Upload confirmed but local update failed', error)
      }
    }

    if (isActive())
      toast.success(
        `${paths.length} ${paths.length === 1 ? 'file uploaded' : 'files uploaded'}`,
        { id: notification },
      )
    else dismiss()
    return paths
  } catch (cause) {
    const detail =
      cause instanceof Error ? cause.message : 'Could not upload media'
    if (isActive())
      toast.error(`${paths.length} of ${values.length} files uploaded`, {
        id: notification,
        description: detail,
        duration: Infinity,
        closeButton: true,
      })
    else dismiss()
    throw new MediaUploadError(detail, paths)
  }
}
