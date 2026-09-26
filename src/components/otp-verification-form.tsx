import { LoaderCircle } from 'lucide-react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'

import { OperationError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import { FieldError } from '#/components/ui/field'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '#/components/ui/input-otp'

import type { FormEvent } from 'react'

export function OtpVerificationForm({
  busy,
  email,
  error,
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
  error: unknown
  otp: string
  pending: boolean
  resendPending: boolean
  onChange: (value: string) => void
  onResend: () => void
  onSignInAnotherWay: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  validationError?: string
}) {
  return (
    <form
      className="flex w-full flex-col items-center gap-6"
      onSubmit={onSubmit}
    >
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-medium tracking-tight">
          Verify your login
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to {email}.
        </p>
      </div>

      <OperationError
        error={error}
        fallback="Could not verify the sign-in code. Try again."
      />

      <div className="flex flex-col items-center gap-2">
        <InputOTP
          aria-invalid={Boolean(validationError)}
          aria-label="Six-digit code"
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
                className="size-10 font-mono text-lg"
                index={index}
                key={index}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <FieldError>{validationError}</FieldError>
      </div>

      <div className="w-full space-y-2">
        <Button
          className="w-full"
          disabled={busy || otp.length !== 6}
          type="submit"
        >
          Verify code
          {pending ? <LoaderCircle className="animate-spin" /> : null}
        </Button>
        <Button
          className="w-full"
          disabled={busy}
          type="button"
          variant="ghost"
          onClick={onResend}
        >
          Resend code
          {resendPending ? <LoaderCircle className="animate-spin" /> : null}
        </Button>
        <Button
          className="w-full"
          disabled={busy}
          type="button"
          variant="ghost"
          onClick={onSignInAnotherWay}
        >
          Sign in another way
        </Button>
      </div>
    </form>
  )
}
