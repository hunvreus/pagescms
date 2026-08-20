import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { GitHubIcon } from '#/components/github-icon'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { emailOtp, signIn } from '#/lib/auth-client'

import type { AuthenticationState } from '#/functions/auth'

type SignInStep = 'email' | 'otp'
type PendingMethod = 'github' | 'email' | 'otp' | null

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
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
  const [message, setMessage] = useState<string | null>(null)
  const busy = pending !== null

  async function signInWithGithub() {
    setMessage(null)
    setPending('github')
    try {
      const result = await signIn.social({
        provider: 'github',
        callbackURL: callbackUrl,
        errorCallbackURL: '/sign-in',
        disableRedirect: true,
      })
      if (result.error?.message) throw new Error(result.error.message)
      if (!result.data?.url) throw new Error('GitHub sign-in did not start.')
      window.location.assign(result.data.url)
    } catch (error) {
      setMessage(getErrorMessage(error, 'Could not start GitHub sign-in.'))
      setPending(null)
    }
  }

  async function sendCode() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setMessage('Enter a valid email address.')
      return
    }

    setMessage(null)
    setPending('email')
    try {
      const result = await emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: 'sign-in',
      })
      if (result.error?.message) throw new Error(result.error.message)
      setEmail(normalizedEmail)
      setOtp('')
      setStep('otp')
      setMessage('We sent you a six-digit sign-in code.')
    } catch (error) {
      setMessage(getErrorMessage(error, 'Could not send a sign-in code.'))
    } finally {
      setPending(null)
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(otp)) {
      setMessage('Enter the six-digit code.')
      return
    }

    setMessage(null)
    setPending('otp')
    try {
      const result = await signIn.emailOtp({ email, otp })
      if (result.error?.message) throw new Error(result.error.message)
      window.location.assign(callbackUrl)
    } catch (error) {
      setMessage(getErrorMessage(error, 'Could not verify the sign-in code.'))
      setPending(null)
    }
  }

  const legalCopy = (
    <p className="text-sm leading-6 text-muted-foreground">
      By continuing, you agree to our{' '}
      <a
        className="underline underline-offset-4"
        href="https://pagescms.org/terms"
      >
        Terms of Service
      </a>{' '}
      and{' '}
      <a
        className="underline underline-offset-4"
        href="https://pagescms.org/privacy"
      >
        Privacy Policy
      </a>
      .
    </p>
  )

  if (step === 'otp') {
    return (
      <div className="space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the code sent to {email}.
          </p>
        </header>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void verifyCode()
          }}
        >
          <Input
            aria-label="Six-digit code"
            autoComplete="one-time-code"
            autoFocus
            className="h-12 text-center font-mono text-xl tracking-[0.35em]"
            disabled={busy}
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
          />
          <Button className="w-full" disabled={busy} size="lg" type="submit">
            Verify and sign in
            {pending === 'otp' ? (
              <LoaderCircle className="animate-spin" />
            ) : null}
          </Button>
        </form>
        <div className="flex justify-between gap-4 text-sm">
          <button
            className="text-primary hover:underline"
            disabled={busy}
            onClick={() => void sendCode()}
            type="button"
          >
            Resend code
          </button>
          <button
            className="text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={() => {
              setStep('email')
              setOtp('')
              setMessage(null)
            }}
            type="button"
          >
            Sign in another way
          </button>
        </div>
        {message ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        {legalCopy}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
          P
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          Sign in to Pages CMS
        </h1>
      </header>

      {methods.github ? (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void signInWithGithub()}
          size="lg"
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
        <div className="relative text-center text-xs uppercase text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:border-t">
          <span className="relative bg-background px-2">Or</span>
        </div>
      ) : null}

      {methods.email ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void sendCode()
          }}
        >
          <Input
            autoComplete="email"
            disabled={busy}
            name="email"
            placeholder="Email address"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button className="w-full" disabled={busy} size="lg" type="submit">
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

      {message ? (
        <p aria-live="polite" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {legalCopy}
    </div>
  )
}
