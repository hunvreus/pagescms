import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { Spinner } from '#/components/ui/spinner'
import { REGEXP_ONLY_DIGITS } from 'input-otp'

import { Button } from '#/components/ui/button'
import { Field, FieldError } from '#/components/ui/field'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '#/components/ui/input-otp'

import { useId } from 'react'
import type { FormEvent } from 'react'

export function OtpVerificationForm({
  busy,
  email,
  otp,
  pending,
  resendPending,
  onChange,
  onResend,
  onSignInAnotherWay,
  onSubmit,
  validationError,
}: {
  busy: boolean
  email: string
  otp: string
  pending: boolean
  resendPending: boolean
  onChange: (value: string) => void
  onResend: () => void
  onSignInAnotherWay: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  validationError?: string
}) {
  const { t } = useUiMessages()
  const errorId = useId()
  return (
    <form
      className="flex w-full flex-col items-center gap-6"
      onSubmit={onSubmit}
    >
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-medium tracking-tight">
          <UiTrans>Verify your login</UiTrans>
        </h1>
        <p className="text-sm text-muted-foreground">
          <UiTrans>Enter the 6-digit code sent to {email}.</UiTrans>
        </p>
      </div>

      <Field
        data-invalid={Boolean(validationError)}
        className="flex flex-col items-center gap-2 *:w-auto"
      >
        <InputOTP
          aria-invalid={Boolean(validationError)}
          aria-label={t`Six-digit code`}
          aria-describedby={validationError ? errorId : undefined}
          autoComplete="one-time-code"
          autoFocus
          disabled={pending}
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          value={otp}
          onChange={onChange}
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, index) => (
              <InputOTPSlot
                aria-invalid={Boolean(validationError)}
                className="size-10 font-mono text-lg"
                index={index}
                key={index}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <FieldError id={errorId}>{validationError}</FieldError>
      </Field>

      <div className="w-full space-y-2">
        <Button
          aria-busy={pending}
          className="w-full"
          disabled={busy || otp.length !== 6}
          type="submit"
        >
          <UiTrans>Verify code</UiTrans>
          {pending ? (
            <Spinner data-icon="inline-end" aria-hidden="true" />
          ) : null}
        </Button>
        <Button
          aria-busy={resendPending}
          className="w-full"
          disabled={busy}
          type="button"
          variant="ghost"
          onClick={onResend}
        >
          <UiTrans>Resend code</UiTrans>
          {resendPending ? (
            <Spinner data-icon="inline-end" aria-hidden="true" />
          ) : null}
        </Button>
        <Button
          className="w-full"
          disabled={busy}
          type="button"
          variant="ghost"
          onClick={onSignInAnotherWay}
        >
          <UiTrans>Sign in another way</UiTrans>
        </Button>
      </div>
    </form>
  )
}
