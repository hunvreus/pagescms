export const PROFILE_IMAGE_MAX_BYTES = 100 * 1024
export interface ProfileUpdate {
  name: string
  image?: string | null
}

export function parseProfileRequest(input: unknown): ProfileUpdate {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid profile update.')
  const value = input as Record<string, unknown>
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.trim().length > 120
  )
    throw new Error('Name must contain between 1 and 120 characters.')
  const profile: ProfileUpdate = {
    name: value.name.trim(),
  }
  if (value.image === undefined) return profile
  if (value.image === null) return { ...profile, image: null }
  if (
    typeof value.image !== 'string' ||
    value.image.length > Math.ceil(PROFILE_IMAGE_MAX_BYTES / 3) * 4 + 32
  )
    throw new Error('Choose a picture smaller than 100 KB.')
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value.image,
    )
  if (!match) throw new Error('Choose a PNG, JPEG or WebP picture.')
  let bytes: string
  try {
    bytes = atob(match[2])
  } catch {
    throw new Error('The picture could not be read.')
  }
  const signature = [...bytes.slice(0, 12)].map((byte) => byte.charCodeAt(0))
  const valid =
    match[1] === 'png'
      ? [137, 80, 78, 71, 13, 10, 26, 10].every(
          (byte, index) => signature[index] === byte,
        )
      : match[1] === 'jpeg'
        ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
  if (!valid || bytes.length > PROFILE_IMAGE_MAX_BYTES)
    throw new Error('The picture could not be read.')
  return { ...profile, image: value.image }
}
