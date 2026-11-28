// Adapted from vercel/avatar's gradient generator (MIT).
// Copyright (c) 2017 Tobias Lins. See LICENSES/vercel-avatar.txt.
export async function avatarGradient(identity: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(identity.trim().toLowerCase()),
  )
  const hue = new Uint8Array(digest).reduce((sum, byte) => sum + byte, 0) % 360
  return `linear-gradient(135deg, hsl(${hue} 95% 50%), hsl(${(hue + 120) % 360} 95% 50%))`
}
