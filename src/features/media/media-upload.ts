import { createMedia } from '#/functions/media'

import type { MediaCoordinates } from './media-browser'

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

export async function uploadMediaFiles({
  coordinates,
  extensions,
  files,
  limit,
  path,
}: {
  coordinates: MediaCoordinates
  extensions?: string[]
  files: FileList | File[]
  limit?: number
  path: string
}) {
  const values = Array.from(files).slice(0, limit)
  const paths: string[] = []

  for (const file of values) {
    validateMediaUpload(file, extensions)
    const result = await createMedia({
      data: {
        ...coordinates,
        path,
        filename: file.name,
        content: await mediaFileBase64(file),
      },
    })
    paths.push(result.path)
  }

  return paths
}
