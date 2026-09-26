import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { OtpVerificationForm } from './otp-verification-form'

describe('OtpVerificationForm', () => {
  it('renders the six-slot OTP control and full-width button actions', () => {
    const html = renderToStaticMarkup(
      <OtpVerificationForm
        busy={false}
        email="editor@example.com"
        error={null}
        otp="123"
        pending={false}
        resendPending={false}
        onChange={vi.fn()}
        onResend={vi.fn()}
        onSignInAnotherWay={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(html.match(/data-slot="input-otp-slot"/g)).toHaveLength(6)
    expect(html).toContain('Verify your login')
    expect(html).toContain('Enter the 6-digit code sent to editor@example.com.')
    expect(html).toContain('Verify code')
    expect(html).toContain('Resend code')
    expect(html).toContain('Sign in another way')
    expect(html).not.toContain('We sent you a six-digit sign-in code.')
  })
})
