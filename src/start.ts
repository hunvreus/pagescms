import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { createRequestServicesAccessorForRequest } from 'virtual:pagescms-request-services-bootstrap'
import {
  getRequestId,
  isClientDisconnect,
  logServerEvent,
  serverErrorDetails,
  withRequestId,
} from '#/server/http'

import type { getRouter } from './router'

const requestServicesMiddleware = createMiddleware({ type: 'request' }).server(
  ({ next, request }) =>
    next({
      context: {
        getServices: createRequestServicesAccessorForRequest(request),
      },
    }),
)

const requestLoggingMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ handlerType, next, pathname, request }) => {
    const requestId = getRequestId(request)
    const startedAt = Date.now()
    try {
      const result = await next()
      const response = withRequestId(result.response, requestId)
      if (response.status >= 500) {
        logServerEvent('error', {
          event: 'request_failed',
          requestId,
          handlerType,
          method: request.method,
          path: pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
        })
      }
      return { ...result, response }
    } catch (error) {
      logServerEvent(isClientDisconnect(error) ? 'info' : 'error', {
        event: isClientDisconnect(error)
          ? 'request_disconnected'
          : 'request_failed',
        requestId,
        handlerType,
        method: request.method,
        path: pathname,
        durationMs: Date.now() - startedAt,
        ...serverErrorDetails(error),
      })
      throw error
    }
  },
)

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    requestLoggingMiddleware,
    csrfMiddleware,
    requestServicesMiddleware,
  ],
}))

// The standalone route generator does not emit TanStack Start's registration
// footer, so keep the application context registration beside the start entry.
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
