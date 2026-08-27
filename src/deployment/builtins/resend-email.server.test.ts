import { describe, expect, it, vi } from 'vitest'

import { createResendEmailProvider } from './resend-email.server'

describe('Resend email deployment builtin', () => {
  it('is disabled when Resend is not configured', () => {
    expect(createResendEmailProvider({})).toBeUndefined()
  })

  it('rejects partial configuration', () => {
    expect(() =>
      createResendEmailProvider({ RESEND_API_KEY: 're_test' }),
    ).toThrow('must be provided together')
  })

  it('sends the normalized message through the Resend HTTP API', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 200 }),
    )
    const provider = createResendEmailProvider(
      {
        RESEND_API_KEY: 're_test',
        RESEND_FROM_EMAIL: 'Pages CMS <hello@pagescms.org>',
      },
      fetcher,
    )

    await provider!.send({
      to: { email: 'editor@example.com', name: 'Editor' },
      subject: 'Sign in',
      text: 'Code: 123456',
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer re_test',
          'content-type': 'application/json',
        },
      }),
    )
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      from: 'Pages CMS <hello@pagescms.org>',
      to: ['Editor <editor@example.com>'],
      subject: 'Sign in',
      text: 'Code: 123456',
    })
  })

  it('surfaces Resend API failures', async () => {
    const provider = createResendEmailProvider(
      {
        RESEND_API_KEY: 're_test',
        RESEND_FROM_EMAIL: 'hello@pagescms.org',
      },
      vi.fn(async () =>
        Response.json({ message: 'Domain is not verified' }, { status: 422 }),
      ),
    )

    await expect(
      provider!.send({ to: 'editor@example.com', subject: 'Sign in' }),
    ).rejects.toThrow('Domain is not verified')
  })
})
