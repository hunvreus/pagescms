import { useRouteRetry } from '#/hooks/use-route-retry'
import { Spinner } from '#/components/ui/spinner'
import { useLingui } from '@lingui/react'

import { Link } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'

import type { ErrorComponentProps } from '@tanstack/react-router'

export function RootError({ reset }: ErrorComponentProps) {
  const { i18n: fallbackI18n } = useLingui()
  const { retry, retrying } = useRouteRetry(reset)

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>
            {fallbackI18n._(
              /* i18n */ {
                id: 'core.fallback.8d886c0ba6',
                message: 'Something went wrong',
              },
            )}
          </EmptyTitle>
          <EmptyDescription>
            {fallbackI18n._(
              /* i18n */ {
                id: 'core.fallback.f05238b4c5',
                message:
                  "We couldn't load this page. Try again or return to your projects.",
              },
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void retry()}
              disabled={retrying}
              aria-busy={retrying}
              size="sm"
              type="button"
              variant="outline"
            >
              {fallbackI18n._(
                /* i18n */ {
                  id: 'core.fallback.042c862e44',
                  message: 'Try again',
                },
              )}
              {retrying ? <Spinner /> : null}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/">
                {fallbackI18n._(
                  /* i18n */ {
                    id: 'core.fallback.0559813da2',
                    message: 'Back to projects',
                  },
                )}
              </Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </main>
  )
}
