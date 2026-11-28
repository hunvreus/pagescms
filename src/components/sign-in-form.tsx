import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'
import { Spinner } from '#/components/ui/spinner'
import { lazy, Suspense, useId, useState } from 'react'
import deployment from '#pagescms/deployment/client'

import { GitHubIcon } from '#/components/github-icon'
import { notifyError } from '#/lib/notifications'
import { OtpVerificationForm } from '#/components/otp-verification-form'
import { Button } from '#/components/ui/button'
import { Field, FieldError } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { emailOtp, signIn } from '#/client/api/auth'

import type { AuthenticationState } from '#/lib/authentication'

const SignInLegal = deployment.ui.signInLegal
  ? lazy(deployment.ui.signInLegal)
  : null

type SignInStep = 'email' | 'otp'
type SocialProvider = 'github' | 'google'
type PendingMethod = SocialProvider | 'email' | 'otp' | null

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
  const { t: _t } = useUiMessages()

  const { t } = useUiMessages()
  const emailErrorId = useId()
  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<SignInStep>('email')
  const [pending, setPending] = useState<PendingMethod>(null)
  const [validationError, setValidationError] = useState<string>()
  const busy = pending !== null

  async function signInWithProvider(provider: SocialProvider) {
    setPending(provider)
    try {
      const result = await signIn.social({
        provider,
        callbackURL: callbackUrl,
        errorCallbackURL: '/auth/error',
        disableRedirect: true,
      })
      if (result.error) throw result.error
      if (!result.data.url) throw new Error('OAuth authorization URL missing')
      window.location.assign(result.data.url)
    } catch (cause) {
      notifyError(
        authenticationError(
          cause,
          `${provider === 'github' ? 'GitHub' : 'Google'} sign-in is temporarily unavailable. Try again.`,
        ),
        _t({ message: 'Could not sign in. Try again.' }),
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
      notifyError(
        authenticationError(
          cause,
          'Email sign-in is temporarily unavailable. Try again.',
        ),
        _t({ message: 'Could not sign in. Try again.' }),
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

    setValidationError(undefined)
    setPending('otp')
    try {
      const result = await signIn.emailOtp({ email, otp })
      if (result.error) throw result.error
      window.location.assign(callbackUrl)
    } catch (cause) {
      if (['INVALID_OTP', 'OTP_EXPIRED'].includes(errorCode(cause) ?? ''))
        setValidationError(
          authenticationError(cause, 'Could not verify the code.').message,
        )
      else
        notifyError(
          authenticationError(
            cause,
            'Could not verify the sign-in code. Try again.',
          ),
          _t({ message: 'Could not verify the sign-in code. Try again.' }),
        )
      setPending(null)
    }
  }

  const legalCopy = SignInLegal ? (
    <Suspense fallback={null}>
      <SignInLegal />
    </Suspense>
  ) : null

  if (step === 'otp') {
    return (
      <div className="space-y-6">
        <OtpVerificationForm
          busy={busy}
          email={email}
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
          <UiTrans>Sign in to Pages CMS</UiTrans>
        </h1>
      </header>

      {methods.github || methods.google ? (
        <div className="space-y-2">
          {methods.github ? (
            <Button
              aria-busy={pending === 'github'}
              className="w-full"
              disabled={busy}
              onClick={() => void signInWithProvider('github')}
              type="button"
            >
              <GitHubIcon data-icon="inline-start" />
              <UiTrans>Sign in with GitHub</UiTrans>
              {pending === 'github' ? (
                <Spinner data-icon="inline-end" aria-hidden="true" />
              ) : null}
            </Button>
          ) : null}
          {methods.google ? (
            <Button
              aria-busy={pending === 'google'}
              className="w-full"
              disabled={busy}
              onClick={() => void signInWithProvider('google')}
              type="button"
              variant="outline"
            >
              <UiTrans>Sign in with Google</UiTrans>
              {pending === 'google' ? (
                <Spinner data-icon="inline-end" aria-hidden="true" />
              ) : null}
            </Button>
          ) : null}
        </div>
      ) : null}

      {(methods.github || methods.google) && methods.email ? (
        <div className="relative text-center text-xs uppercase text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-border">
          <span className="relative bg-background px-2">
            <UiTrans>Or</UiTrans>
          </span>
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
              aria-label={t`Email`}
              aria-describedby={validationError ? emailErrorId : undefined}
              autoComplete="email"
              disabled={busy}
              name="email"
              placeholder={t`Email`}
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setValidationError(undefined)
              }}
            />
            <FieldError id={emailErrorId}>{validationError}</FieldError>
          </Field>
          <Button
            aria-busy={pending === 'email'}
            className="w-full"
            disabled={busy}
            type="submit"
          >
            <UiTrans>Continue with email</UiTrans>
            {pending === 'email' ? (
              <Spinner data-icon="inline-end" aria-hidden="true" />
            ) : null}
          </Button>
        </form>
      ) : null}

      {!methods.github && !methods.google && !methods.email ? (
        <p className="rounded-lg border bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
          <UiTrans>
            No sign-in provider is configured. Add GitHub or Google credentials,
            or an email plugin to this deployment.
          </UiTrans>
        </p>
      ) : null}

      {legalCopy}
    </div>
  )
}
