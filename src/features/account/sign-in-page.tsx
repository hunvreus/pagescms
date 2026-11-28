import { useLingui as useUiMessages } from '@lingui/react/macro'
import { SignInForm } from '#/components/sign-in-form'
import { OperationError } from '#/components/operation-error'
import { SignInLayout } from './sign-in-layout'
import { AccountDeletedNotice } from './account-deleted-notice'
import type { AuthenticationState } from '#/lib/authentication'

export function SignInPage({
  callbackUrl,
  email,
  error,
  deleted,
  methods,
  onDeletionNoticeShown,
}: {
  callbackUrl: string
  email: string
  error?: string
  deleted?: boolean
  methods: AuthenticationState['methods']
  onDeletionNoticeShown?: () => void
}) {
  const { t: _t } = useUiMessages()

  return (
    <SignInLayout>
      {deleted && onDeletionNoticeShown ? (
        <AccountDeletedNotice onShown={onDeletionNoticeShown} />
      ) : null}
      {error ? (
        <OperationError
          error={true}
          fallback={_t({
            message: 'Sign-in could not be completed. Try again.',
          })}
        />
      ) : null}
      <SignInForm
        callbackUrl={callbackUrl}
        initialEmail={email}
        methods={methods}
      />
    </SignInLayout>
  )
}
