import {
  QueryClientProvider,
  QueryErrorResetBoundary,
} from '@tanstack/react-query'
import { bindBrowserI18n } from './i18n/errors'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import { RootError } from './components/root-error'
import { getContext } from './integrations/tanstack-query/root-provider'
import { routeTree } from './routeTree.gen'
import deployment from '#pagescms/deployment/client'
import { attachStandalonePluginRoutes } from './features/plugins/standalone-plugin-routes'

attachStandalonePluginRoutes(routeTree, deployment.pages)

export function getRouter() {
  const context = {
    ...getContext(),
    i18n: setupI18n({ locale: 'en', messages: { en: {} } }),
  }

  bindBrowserI18n(context.i18n)

  const router = createTanStackRouter({
    routeTree,
    context,
    Wrap: ({ children }) => (
      <QueryClientProvider client={context.queryClient}>
        <QueryErrorResetBoundary>
          <I18nProvider i18n={context.i18n}>{children}</I18nProvider>
        </QueryErrorResetBoundary>
      </QueryClientProvider>
    ),
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RootError,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
