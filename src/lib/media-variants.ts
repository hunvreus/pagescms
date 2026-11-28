/** Presentation requests; providers choose how to deliver each named variant. */
export const mediaVariants = [
  'original',
  'thumbnail',
  'card',
  'preview',
] as const
export type MediaVariant = (typeof mediaVariants)[number]

export function parseMediaVariant(value: unknown): MediaVariant {
  if (value === undefined || value === null) return 'original'
  if (
    typeof value !== 'string' ||
    !mediaVariants.includes(value as MediaVariant)
  )
    throw new Error('Invalid media variant')
  return value as MediaVariant
}
