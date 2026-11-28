import { browserTranslator, localizeErrorMessage } from '#/i18n/errors'
import { msg } from '@lingui/core/macro'
import { OperationAcknowledgementError } from './operation-error'
import { toast as sonnerToast } from 'sonner'
import { accessDenialFrom, userFacingError } from './access-denial'

export { OperationAcknowledgementError } from './operation-error'

function notificationText<T>(value: T): T {
  return (
    typeof value === 'string'
      ? localizeErrorMessage(browserTranslator(), value)
      : value
  ) as T
}
function notificationOptions(options: Parameters<typeof sonnerToast>[1]) {
  return options
    ? {
        ...options,
        description: notificationText(options.description),
        action:
          options.action &&
          typeof options.action === 'object' &&
          'label' in options.action
            ? {
                ...options.action,
                label: notificationText(options.action.label),
              }
            : options.action,
        cancel:
          options.cancel &&
          typeof options.cancel === 'object' &&
          'label' in options.cancel
            ? {
                ...options.cancel,
                label: notificationText(options.cancel.label),
              }
            : options.cancel,
      }
    : options
}
export const toast: typeof sonnerToast = Object.assign(
  (...[message, options]: Parameters<typeof sonnerToast>) =>
    sonnerToast(notificationText(message), notificationOptions(options)),
  sonnerToast,
  {
    success: (...[message, options]: Parameters<typeof sonnerToast.success>) =>
      sonnerToast.success(
        notificationText(message),
        notificationOptions(options),
      ),
    error: (...[message, options]: Parameters<typeof sonnerToast.error>) =>
      sonnerToast.error(
        notificationText(message),
        notificationOptions(options),
      ),
    info: (...[message, options]: Parameters<typeof sonnerToast.info>) =>
      sonnerToast.info(notificationText(message), notificationOptions(options)),
    warning: (...[message, options]: Parameters<typeof sonnerToast.warning>) =>
      sonnerToast.warning(
        notificationText(message),
        notificationOptions(options),
      ),
    loading: (...[message, options]: Parameters<typeof sonnerToast.loading>) =>
      sonnerToast.loading(
        notificationText(message),
        notificationOptions(options),
      ),
    message: (...[message, options]: Parameters<typeof sonnerToast.message>) =>
      sonnerToast.message(
        notificationText(message),
        notificationOptions(options),
      ),
  },
)

type ErrorOptions = NonNullable<Parameters<typeof toast.error>[1]> & {
  title?: string
  account?: string
}

let notificationVersion = 0
let accountKnown = false
let notificationAccount: string | undefined

export function setNotificationAccount(account: string | undefined) {
  if (notificationAccount !== undefined && notificationAccount !== account)
    notificationVersion++
  if (
    accountKnown &&
    notificationAccount !== undefined &&
    notificationAccount !== account
  )
    toast.dismiss()
  notificationAccount = account
  accountKnown = true
}

/** The action owner reports once; callers may recover or render field issues. */
export function notifyError(
  error: unknown,
  fallback: string,
  { title, account, ...options }: ErrorOptions = {},
) {
  if (account !== undefined && accountKnown && account !== notificationAccount)
    return
  const denial = accessDenialFrom(error)
  return toast.error(
    title
      ? localizeErrorMessage(browserTranslator(), title)
      : userFacingError(error, fallback, browserTranslator()),
    {
      ...options,
      action: denial?.actionUrl
        ? {
            label:
              browserTranslator()?._(msg({ message: 'Learn more' })) ??
              'Learn more',
            onClick: () => window.location.assign(denial.actionUrl!),
          }
        : denial || error instanceof OperationAcknowledgementError
          ? undefined
          : options.action,
    },
  )
}

/** Covers preparation and dispatch, including failures before a mutation starts. */
export async function withErrorNotification<T>(
  run: () => Promise<T>,
  fallback: string,
  options: {
    id?: ErrorOptions['id']
    active?: () => boolean
    handled?: (error: unknown) => boolean
  } = {},
): Promise<T> {
  const version = notificationVersion
  try {
    return await run()
  } catch (error) {
    let handled = false
    try {
      handled = Boolean(options.handled?.(error))
    } catch (failure) {
      console.warn('Operation error classification failed', failure)
    }
    if (
      version === notificationVersion &&
      (options.active?.() ?? true) &&
      !handled
    )
      notifyError(error, fallback, { id: options.id })
    throw error
  }
}
