import { useLingui } from '@lingui/react'
import { localizeErrorMessage } from '#/i18n/errors'
import { Trans as UiTrans } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import CircleAlert from '@hugeicons/core-free-icons/AlertCircleIcon'

import { ErrorAlert } from '#/components/error-alert'
import { accessDenialFrom, userFacingError } from '#/lib/access-denial'

import { Button } from './ui/button'

export { LocalizedError } from '#/i18n/localized-error'

export function LoadError({
  error,
  message,
  onRetry,
  retrying = false,
  stale = false,
  retryLabel,
  inline = false,
}: {
  error: unknown
  message: string
  onRetry?: () => void
  retrying?: boolean
  stale?: boolean
  retryLabel?: React.ReactNode
  inline?: boolean
}) {
  const { i18n } = useLingui()
  if (!error) return null
  const denial = accessDenialFrom(error)
  if (inline)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span role="alert" className="text-destructive">
          {denial ? localizeErrorMessage(i18n, denial.message) : message}
          {stale && !denial ? (
            <>
              {' '}
              <UiTrans>The displayed results may be out of date.</UiTrans>
            </>
          ) : null}
        </span>
        {denial?.actionUrl ? (
          <Button asChild size="xs" variant="outline">
            <a href={denial.actionUrl} rel="noreferrer">
              <UiTrans>Learn more</UiTrans>
            </a>
          </Button>
        ) : onRetry ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={retrying}
            aria-busy={retrying}
            onClick={onRetry}
          >
            {retryLabel ?? <UiTrans>Try again</UiTrans>}
          </Button>
        ) : null}
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span
        role="alert"
        className="inline-flex items-start gap-2 text-destructive"
      >
        <HugeiconsIcon
          icon={CircleAlert}
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0"
        />
        <span>
          {denial ? localizeErrorMessage(i18n, denial.message) : message}
          {stale && !denial ? (
            <>
              {' '}
              <UiTrans>The displayed results may be out of date.</UiTrans>
            </>
          ) : null}
        </span>
      </span>
      {denial?.actionUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={denial.actionUrl} rel="noreferrer">
            <UiTrans>Learn more</UiTrans>
          </a>
        </Button>
      ) : onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={retrying}
          aria-busy={retrying}
          onClick={onRetry}
        >
          {retryLabel ?? <UiTrans>Try again</UiTrans>}
        </Button>
      ) : null}
    </div>
  )
}

export function OperationError({
  error,
  title,
  fallback = 'The operation could not be completed.',
  onRetry,
  retrying = false,
  retryLabel = 'Try again',
}: {
  error: unknown
  title?: string
  fallback?: string
  onRetry?: () => void
  retrying?: boolean
  retryLabel?: string
}) {
  const { i18n } = useLingui()
  if (!error) return null
  const denial = accessDenialFrom(error)
  return (
    <ErrorAlert
      title={title}
      action={
        denial?.actionUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={denial.actionUrl} rel="noreferrer">
              <UiTrans>Learn more</UiTrans>{' '}
              <HugeiconsIcon
                aria-hidden="true"
                icon={ArrowUpRight}
                className="opacity-50"
                data-icon="inline-end"
              />
            </a>
          </Button>
        ) : onRetry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={retrying}
            aria-busy={retrying}
            onClick={onRetry}
          >
            {localizeErrorMessage(i18n, retryLabel)}
          </Button>
        ) : undefined
      }
    >
      {userFacingError(error, fallback, i18n)}
    </ErrorAlert>
  )
}
