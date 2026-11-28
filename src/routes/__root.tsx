import { msg } from '@lingui/core/macro'
import { LocalizedRouteHead } from '#/i18n/localized-route-head'
import { useLingui } from '@lingui/react'

import type { I18n } from '@lingui/core'
import { authenticationQueryOptions } from '#/client/queries/session'
import { activateLocale } from '#/i18n/catalogs'
import { Suspense } from 'react'
import { deferredComponent } from '#/lib/deferred-component'
import {
  HeadContent,
  Link,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { Button } from '#/components/ui/button'
import { StartupError } from '#/components/startup-error'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'

import '../styles.css'

import type { QueryClient } from '@tanstack/react-query'

export interface MyRouterContext {
  queryClient: QueryClient
  i18n: I18n
}

const Toaster = deferredComponent(async () => {
  const module = await import('#/components/ui/sonner')
  return { default: module.Toaster }
})

const descriptionMessage = msg({
  message: 'The open-source CMS for GitHub repositories.',
})
const socialImageAlt = msg({ message: 'Pages CMS social card' })
const LocalAccountData = deferredComponent(async () => {
  const module = await import('#/features/account/local-account-data')
  return { default: module.LocalAccountData }
})
const ComponentPreloading = deferredComponent(() =>
  import('#/components/component-preloading').catch(() => ({
    default: () => null,
  })),
)

export const Route = createRootRouteWithContext<MyRouterContext>()({
  staleTime: Infinity,
  preloadStaleTime: Infinity,
  loader: async ({ context }) => {
    const { locale } = await context.queryClient.ensureQueryData(
      authenticationQueryOptions(),
    )
    document.documentElement.lang = locale ?? 'en'
    await activateLocale(context.i18n, locale ?? 'en')
  },
  head: () => ({ meta: [{ title: 'Pages CMS' }] }),
  errorComponent: StartupError,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { i18n } = useLingui()
  return (
    <>
      <HeadContent />
      <LocalizedRouteHead
        description={i18n._(descriptionMessage)}
        imageAlt={i18n._(socialImageAlt)}
      />
      {children}
      <Suspense fallback={null}>
        <Toaster position="bottom-right" />
        <LocalAccountData />
      </Suspense>
      <Suspense fallback={null}>
        <ComponentPreloading />
      </Suspense>
      {import.meta.env.DEV &&
      import.meta.env.VITE_DISABLE_TANSTACK_DEVTOOLS !== 'true' ? (
        <TanStackDevtools
          config={{
            position: 'bottom-right',
            triggerMode: 'fixed',
          }}
          plugins={[
            {
              name: 'TanStack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
      ) : null}
    </>
  )
}

function NotFound() {
  const { i18n: fallbackI18n } = useLingui()
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyTitle>
            {fallbackI18n._(
              /* i18n */ {
                id: 'core.fallback.bc3023b360',
                message: 'Page not found',
              },
            )}
          </EmptyTitle>
          <EmptyDescription>
            {fallbackI18n._(
              /* i18n */ {
                id: 'core.fallback.78fbb3370a',
                message:
                  'The page you requested does not exist or may have moved.',
              },
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild size="sm">
            <Link to="/">
              {fallbackI18n._(
                /* i18n */ {
                  id: 'core.fallback.a3d070bc45',
                  message: 'Return home',
                },
              )}
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
