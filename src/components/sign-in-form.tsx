import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { GitHubIcon } from '#/components/github-icon'
import { OperationError } from '#/components/operation-error'
import { OtpVerificationForm } from '#/components/otp-verification-form'
import { Button } from '#/components/ui/button'
import { Field, FieldError } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { emailOtp, signIn } from '#/lib/auth-client'

import type { AuthenticationState } from '#/functions/auth'

type SignInStep = 'email' | 'otp'
type PendingMethod = 'github' | 'email' | 'otp' | null

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return
  return typeof error.code === 'string' ? error.code : undefined
}

function authenticationError(error: unknown, fallback: string) {
  const code = errorCode(error)
  if (code === 'INVALID_OTP') return new Error('That code is incorrect.')
  if (code === 'OTP_EXPIRED') {
    return new Error('That code has expired. Request a new one.')
  }
  return new Error(fallback)
}

export function SignInForm({
  callbackUrl,
  initialEmail,
  methods,
}: {
  callbackUrl: string
  initialEmail: string
  methods: AuthenticationState['methods']
}) {
  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<SignInStep>('email')
  const [pending, setPending] = useState<PendingMethod>(null)
  const [error, setError] = useState<unknown>(null)
  const [validationError, setValidationError] = useState<string>()
  const busy = pending !== null

  async function signInWithGithub() {
    setError(null)
    setPending('github')
    try {
      const result = await signIn.social({
        provider: 'github',
        callbackURL: callbackUrl,
        errorCallbackURL: '/auth/error',
        disableRedirect: true,
      })
      if (result.error) throw result.error
      if (!result.data.url) throw new Error('OAuth authorization URL missing')
      window.location.assign(result.data.url)
    } catch (cause) {
      setError(
        authenticationError(
          cause,
          'GitHub sign-in is temporarily unavailable. Try again.',
        ),
      )
      setPending(null)
    }
  }

  async function sendCode() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setValidationError('Enter a valid email address.')
      return
    }

    setError(null)
    setValidationError(undefined)
    setPending('email')
    try {
      const result = await emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: 'sign-in',
      })
      if (result.error) throw result.error
      setEmail(normalizedEmail)
      setOtp('')
      setStep('otp')
    } catch (cause) {
      setError(
        authenticationError(
          cause,
          'Email sign-in is temporarily unavailable. Try again.',
        ),
      )
    } finally {
      setPending(null)
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(otp)) {
      setValidationError('Enter the 6-digit code.')
      return
    }

    setError(null)
    setValidationError(undefined)
    setPending('otp')
    try {
      const result = await signIn.emailOtp({ email, otp })
      if (result.error) throw result.error
      window.location.assign(callbackUrl)
    } catch (cause) {
      setError(
        authenticationError(
          cause,
          'Could not verify the sign-in code. Try again.',
        ),
      )
      setPending(null)
    }
  }

  const legalCopy = (
    <p className="text-sm leading-6 text-muted-foreground">
      By clicking continue, you agree to our{' '}
      <a
        className="underline underline-offset-4"
        href="https://pagescms.org/terms"
        target="_blank"
      >
        Terms of Service
      </a>{' '}
      and{' '}
      <a
        className="underline underline-offset-4"
        href="https://pagescms.org/privacy"
        target="_blank"
      >
        Privacy Policy
      </a>
      .
    </p>
  )

  if (step === 'otp') {
    return (
      <div className="space-y-6">
        <OtpVerificationForm
          busy={busy}
          email={email}
          error={error}
          otp={otp}
          pending={pending === 'otp'}
          resendPending={pending === 'email'}
          onChange={(value) => {
            setOtp(value)
            setValidationError(undefined)
          }}
          onResend={() => void sendCode()}
          onSignInAnotherWay={() => {
            setStep('email')
            setOtp('')
            setError(null)
            setValidationError(undefined)
          }}
          onSubmit={(event) => {
            event.preventDefault()
            void verifyCode()
          }}
          validationError={validationError}
        />
        {legalCopy}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-lg font-medium tracking-tight">
          Sign in to Pages CMS
        </h1>
      </header>

      <OperationError
        error={error}
        fallback="Sign-in is temporarily unavailable. Try again."
      />

      {methods.github ? (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void signInWithGithub()}
          type="button"
        >
          <GitHubIcon />
          Sign in with GitHub
          {pending === 'github' ? (
            <LoaderCircle className="animate-spin" />
          ) : null}
        </Button>
      ) : null}

      {methods.github && methods.email ? (
        <div className="relative text-center text-xs uppercase text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-border">
          <span className="relative bg-background px-2">Or</span>
        </div>
      ) : null}

      {methods.email ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void sendCode()
          }}
        >
          <Field data-invalid={Boolean(validationError)}>
            <Input
              aria-invalid={Boolean(validationError)}
              autoComplete="email"
              disabled={busy}
              name="email"
              placeholder="Email"
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setValidationError(undefined)
              }}
            />
            <FieldError>{validationError}</FieldError>
          </Field>
          <Button className="w-full" disabled={busy} type="submit">
            Continue with email
            {pending === 'email' ? (
              <LoaderCircle className="animate-spin" />
            ) : null}
          </Button>
        </form>
      ) : null}

      {!methods.github && !methods.email ? (
        <p className="rounded-lg border bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
          No sign-in provider is configured. Add GitHub credentials or an email
          plugin to this deployment.
        </p>
      ) : null}

      {legalCopy}
    </div>
  )
}
