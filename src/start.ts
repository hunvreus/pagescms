import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { createCloudflareRequestServicesAccessor } from '#/server/cloudflare-request-services.server'

import type { getRouter } from './router'

const requestServicesMiddleware = createMiddleware({ type: 'request' }).server(
  ({ next, request }) =>
    next({
      context: {
        getServices: createCloudflareRequestServicesAccessor(request),
      },
    }),
)

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, requestServicesMiddleware],
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
