const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function getRequestId(request: Request): string {
  const candidate = request.headers.get('x-request-id')?.trim()

  return candidate && requestIdPattern.test(candidate)
    ? candidate
    : crypto.randomUUID()
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', requestId)

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export function logServerEvent(
  level: 'info' | 'error',
  event: Readonly<Record<string, unknown>>,
): void {
  const message = JSON.stringify(event)

  if (level === 'error') {
    console.error(message)
    return
  }

  console.log(message)
}
