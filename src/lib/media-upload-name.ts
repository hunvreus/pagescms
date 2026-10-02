export type UploadRename = boolean | 'safe' | 'random'

export function parseUploadRename(value: unknown): UploadRename | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean' || value === 'safe' || value === 'random')
    return value
  throw new Error('Invalid upload rename policy')
}

export async function mediaUploadFilename(
  filename: string,
  rename: UploadRename | undefined,
  idempotencyKey: string,
) {
  if (!rename) return filename
  const dot = filename.lastIndexOf('.')
  const extension = dot > 0 ? filename.slice(dot).toLowerCase() : ''
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  if (rename === 'random') {
    if (!idempotencyKey)
      throw new Error('Random upload names require an idempotency key')
    // Initiation, upload, and retries must resolve the same generated path.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${idempotencyKey}\0${filename}`),
    )
    return `${Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    )
      .join('')
      .slice(0, 24)}${extension}`
  }
  const safe =
    stem
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file'
  return `${safe}${extension}`
}
