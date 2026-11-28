const tokens = new Map<string, { value: string; expiresAt: number }>()

export async function readInstallationToken(
  appId: string,
  installationId: number,
  load: () => Promise<{ value: string; expiresAt: number }>,
): Promise<string> {
  const key = JSON.stringify([appId, installationId])
  const cached = tokens.get(key)
  if (cached && cached.expiresAt > Date.now() + 300_000) return cached.value
  const token = await load()
  if (token.expiresAt > Date.now() + 300_000) {
    if (!tokens.has(key) && tokens.size >= 256)
      tokens.delete(tokens.keys().next().value!)
    tokens.set(key, token)
  } else tokens.delete(key)
  return token.value
}

export function invalidateInstallationToken(installationId: number) {
  for (const key of tokens.keys())
    if (JSON.parse(key)[1] === installationId) tokens.delete(key)
}
