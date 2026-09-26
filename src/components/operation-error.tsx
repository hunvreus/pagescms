import { ArrowUpRight } from 'lucide-react'

import { ErrorAlert } from '#/components/error-alert'
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
    <ErrorAlert
      action={
        denial?.upgradeUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={denial.upgradeUrl} rel="noreferrer">
              View plans <ArrowUpRight className="opacity-50" />
            </a>
          </Button>
        ) : undefined
      }
    >
      {denial?.message ?? userFacingError(error, fallback)}
    </ErrorAlert>
  )
}
