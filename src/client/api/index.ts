import { CONTENT_CONFLICT } from '#/shared/content-conflict'

export class ApiNotFoundError extends Error {}

let currentAccount: () => string | undefined = () => undefined
export function bindApiAccount(getAccount: () => string | undefined) {
  currentAccount = getAccount
}

export async function readApi<T>(url: string, init?: RequestInit): Promise<T> {
  let requestInit = init
  if (init?.method && init.method !== 'GET' && init.method !== 'HEAD') {
    const headers = new Headers(init.headers)
    const account = currentAccount()
    if (account) headers.set('x-pagescms-account', account)
    requestInit = { ...init, headers }
  }
  const response = await fetch(url, { cache: 'no-store', ...requestInit })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    if (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      body.code === 'operation_error' &&
      'message' in body &&
      typeof body.message === 'string'
    )
      throw new Error(body.message)
    if (
      response.status === 502 &&
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      body.code === 'github_request_failed' &&
      'status' in body
    )
      throw new Error(
        `GitHub request failed (${body.status}). Please try again.`,
      )
    if (response.status === 413)
      throw new Error('The request exceeds the size limit')
    if (response.status === 401) throw new Error('Authentication required')
    if (response.status === 400) throw new Error('Invalid request')
    if (response.status === 409) {
      if (typeof body === 'object' && body !== null && 'code' in body) {
        if (body.code === 'content_conflict') throw new Error(CONTENT_CONFLICT)
        if (body.code === 'account_changed')
          throw new Error(
            'Your signed-in account changed. Reload and try again.',
          )
      }
      throw new Error('Internal server error')
    }
    if (response.status === 404) throw new ApiNotFoundError('Not found')
    if (response.status === 403) {
      const error = Object.assign(new Error('Access denied'), body)
      error.name = 'AccessDeniedError'
      throw error
    }
    throw new Error('Internal server error')
  }
  return response.json<T>()
}

export function apiQuery<T>(path: string, input: unknown): Promise<T> {
  const params = new URLSearchParams()
  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && value !== null) params.set(key, String(value))
    }
  }
  const query = params.toString()
  return readApi(query ? `${path}?${query}` : path)
}

export function apiMutation<TInput, TOutput>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
) {
  return (input: TInput): Promise<TOutput> => {
    return readApi(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  }
}
