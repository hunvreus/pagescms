import { ArrowUpRight } from 'lucide-react'

import { accessDenialFrom, userFacingError } from '#/lib/access-denial'

import { Button } from './ui/button'

export function OperationError({
  error,
  fallback = 'The operation could not be completed.',
}: {
  error: unknown
  fallback?: string
}) {
  if (!error) return null
  const denial = accessDenialFrom(error)
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-sm text-destructive"
      role="alert"
    >
      <span className="min-w-0 flex-1">
        {denial?.message ?? userFacingError(error, fallback)}
      </span>
      {denial?.upgradeUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={denial.upgradeUrl} rel="noreferrer">
            View plans <ArrowUpRight className="opacity-50" />
          </a>
        </Button>
      ) : null}
    </div>
  )
}
