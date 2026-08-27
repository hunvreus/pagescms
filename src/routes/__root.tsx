import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { FileQuestion } from 'lucide-react'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'

interface MyRouterContext {
  queryClient: QueryClient
}

const description = 'The open-source CMS for GitHub repositories.'
const socialImage = 'https://app.pagescms.org/images/social-card.png'

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Pages CMS',
      },
      {
        name: 'description',
        content: description,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: 'Pages CMS',
      },
      {
        property: 'og:title',
        content: 'Pages CMS',
      },
      {
        property: 'og:description',
        content: description,
      },
      {
        property: 'og:image',
        content: socialImage,
      },
      {
        property: 'og:image:width',
        content: '1200',
      },
      {
        property: 'og:image:height',
        content: '630',
      },
      {
        property: 'og:image:alt',
        content: 'Pages CMS social card',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'Pages CMS',
      },
      {
        name: 'twitter:description',
        content: description,
      },
      {
        name: 'twitter:image',
        content: socialImage,
      },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  errorComponent: RootError,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(_){}})()`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV &&
        import.meta.env.VITE_DISABLE_TANSTACK_DEVTOOLS !== 'true' ? (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
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
        <Scripts />
      </body>
    </html>
  )
}

function RootError({ reset }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            We couldn&apos;t load this page. Try again or return to your
            projects.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex items-center gap-2">
            <Button onClick={reset} type="button">
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Back to projects</Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </main>
  )
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion />
          </EmptyMedia>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            The page you requested does not exist or may have moved.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/">Return to Pages CMS</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
