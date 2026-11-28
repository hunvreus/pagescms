import {
  createRequestServicesAccessorForRequest,
  getPluginHandlers,
  getPublicBaseUrl,
} from 'virtual:pagescms-request-services-bootstrap'
import { matchPluginHandler } from '#/plugins/compose.server'
import { api } from '#/server/routes/index'
import { getRequestId, logServerEvent, withRequestId } from './http'

export default {
  handlesRequest(request: Request) {
    const path = new URL(request.url).pathname
    return (
      path.startsWith('/api/') ||
      Boolean(matchPluginHandler(getPluginHandlers(), path))
    )
  },
  async fetch(
    request: Request,
    waitUntil?: (promise: Promise<unknown>) => void,
  ) {
    const path = new URL(request.url).pathname

    const requestId = getRequestId(request)
    const startedAt = Date.now()
    const responseHeaders = new Headers()
    const response = await api.fetch(request, {
      get publicBaseUrl() {
        return getPublicBaseUrl()
      },
      getServices: createRequestServicesAccessorForRequest(
        request,
        responseHeaders,
        waitUntil,
      ),
      requestId,
    })
    if (response.status >= 500)
      logServerEvent('error', {
        event: 'request_failed',
        requestId,
        handlerType: 'api',
        method: request.method,
        path,
        status: response.status,
        durationMs: Date.now() - startedAt,
      })
    const result = withRequestId(response, requestId)
    if (result.headers.get('content-type')?.startsWith('text/html')) {
      result.headers.set('x-frame-options', 'DENY')
      result.headers.append('content-security-policy', "frame-ancestors 'none'")
    }
    for (const cookie of responseHeaders.getSetCookie())
      result.headers.append('set-cookie', cookie)
    return result
  },
}
