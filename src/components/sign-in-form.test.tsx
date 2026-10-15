import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SignInForm } from './sign-in-form'

describe('SignInForm', () => {
  it('offers Google by itself without showing the unavailable-provider message', () => {
    const html = renderToStaticMarkup(
      <SignInForm
        callbackUrl="/"
        initialEmail=""
        methods={{ github: false, google: true, email: false }}
      />,
    )
    expect(html).toContain('Sign in with Google')
    expect(html).not.toContain('Sign in with GitHub')
    expect(html).not.toContain('Continue with email')
    expect(html).not.toContain('No sign-in provider')
  })

  it('keeps unconfigured Google sign-in hidden', () => {
    const html = renderToStaticMarkup(
      <SignInForm
        callbackUrl="/"
        initialEmail=""
        methods={{ github: true, google: false, email: true }}
      />,
    )
    expect(html).toContain('Sign in with GitHub')
    expect(html).toContain('Continue with email')
    expect(html).not.toContain('Sign in with Google')
  })
})
