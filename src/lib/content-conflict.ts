// A plain Error message survives the server-function transport in production.
export const CONTENT_CONFLICT =
  'This entry was saved while you were editing. Review the changes before saving.'

export function isContentConflict(error: unknown) {
  return error instanceof Error && error.message === CONTENT_CONFLICT
}
