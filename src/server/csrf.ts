export function isLoopbackHostname(host: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(host)
}

export function sameOriginRequest(
  request: Request,
  publicBaseUrl: string,
): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin') return false
  const configured = new URL(publicBaseUrl)
  const incoming = new URL(request.url)
  const expected =
    isLoopbackHostname(configured.hostname) &&
    isLoopbackHostname(incoming.hostname)
      ? incoming.origin
      : configured.origin
  const origin = request.headers.get('origin')
  if (origin !== null) return origin === expected
  const referer = request.headers.get('referer')
  if (referer === null) return site === 'same-origin'
  try {
    return new URL(referer).origin === expected
  } catch {
    return false
  }
}
