export class MediaNotFoundError extends Error {
  constructor(path?: string) {
    super(
      path
        ? `Media object not found: ${path}`
        : 'Media object missing from storage',
    )
    this.name = 'MediaNotFoundError'
  }
}

export const MEDIA_COPY_CONFLICT =
  'The original file changed during the copy. The original was kept, and the destination contains the earlier copy.'
