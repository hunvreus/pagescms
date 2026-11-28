import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '#/components/ui/button'
import Trash2 from '@hugeicons/core-free-icons/Delete02Icon'
import { Skeleton } from '#/components/ui/skeleton'
import { Collapsible } from '#/components/ui/collapsible'
import { CacheFilesTrigger } from './cache-files-trigger'
import { cacheDescriptions } from './cache-copy'
import { RepositoryAdminPage } from './repository-admin-page'

export function CacheSkeleton() {
  const { t: remainingT } = useUiMessages()

  const { t: _t, i18n: cacheI18n } = useUiMessages()

  return (
    <RepositoryAdminPage
      title={_t({ message: 'Cache' })}
      actions={
        <Button
          disabled
          variant="destructive"
          aria-label={_t({ message: 'Clear all' })}
          className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={Trash2}
            className="md:hidden"
          />
          <span className="hidden md:inline">
            <UiTrans>Clear all</UiTrans>
          </span>
        </Button>
      }
    >
      <div
        aria-label={_t({ message: 'Loading cache' })}
        aria-busy="true"
        className="divide-y rounded-xl border bg-card px-4"
      >
        {(['Content', 'Configuration'] as const).map((title) => (
          <div key={title}>
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">
                    {title === 'Content'
                      ? remainingT({ message: 'Content' })
                      : remainingT({ message: 'Configuration' })}
                  </h3>
                  <Skeleton className="h-5 w-28 rounded-full" />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {cacheI18n._(cacheDescriptions[title])}
                </p>
              </div>
              <Button disabled variant="destructive">
                <UiTrans>Clear</UiTrans>
              </Button>
            </div>
            {title === 'Content' ? (
              <Collapsible disabled className="mb-4">
                <CacheFilesTrigger />
              </Collapsible>
            ) : null}
          </div>
        ))}
      </div>
    </RepositoryAdminPage>
  )
}
