import type { AuthenticationState } from '#/lib/authentication'

export async function readAuthenticationState(): Promise<AuthenticationState> {
  const response = await fetch('/api/session', { cache: 'no-store' })
  if (response.status === 401) throw new Error('Authentication required')
  if (!response.ok) throw new Error('Unable to load session')
  return response.json<AuthenticationState>()
}
