import type {
  EmailAddress,
  EmailMessage,
  EmailProvider,
} from '#/server/email.server'

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function configuredString(environment: Record<string, unknown>, name: string) {
  const value = environment[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function address(value: EmailAddress) {
  return typeof value === 'string'
    ? value
    : value.name
      ? `${value.name} <${value.email}>`
      : value.email
}

function addresses(value: EmailAddress | readonly EmailAddress[]) {
  return (Array.isArray(value) ? value : [value]).map(address)
}

async function resendError(response: Response) {
  try {
    const body = record(await response.json())
    if (typeof body?.message === 'string' && body.message) return body.message
  } catch {
    // Resend may return an empty or non-JSON response for an upstream failure.
  }
  return `Resend rejected the email with status ${response.status}`
}

export function createResendEmailProvider(
  environment: unknown,
  fetcher: typeof fetch = fetch,
): EmailProvider | undefined {
  const values = record(environment)
  if (!values) return undefined
  const apiKey = configuredString(values, 'RESEND_API_KEY')
  const from = configuredString(values, 'RESEND_FROM_EMAIL')
  if (!apiKey && !from) return undefined
  if (!apiKey || !from) {
    throw new Error(
      'RESEND_API_KEY and RESEND_FROM_EMAIL must be provided together',
    )
  }

  return {
    async send(message: EmailMessage) {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from ? address(message.from) : from,
          to: addresses(message.to),
          subject: message.subject,
          ...(message.replyTo ? { reply_to: addresses(message.replyTo) } : {}),
          ...(message.text ? { text: message.text } : {}),
          ...(message.html ? { html: message.html } : {}),
        }),
      })
      if (!response.ok) throw new Error(await resendError(response))
    },
  }
}
