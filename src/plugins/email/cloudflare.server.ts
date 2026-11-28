import type { SendEmail } from '@cloudflare/workers-types'
import type { EmailAddress, EmailMessage } from '#/server/email/email'
import type { ServerPlugin } from '../server'

function address(value: EmailAddress) {
  return typeof value === 'string'
    ? value
    : value.name
      ? { email: value.email, name: value.name }
      : value.email
}

export function cloudflareEmail(options: {
  binding: string
  from: EmailAddress
}): ServerPlugin {
  return {
    id: 'cloudflare-email',
    create(environment) {
      if (
        !options.from ||
        !(
          typeof options.from === 'string' ? options.from : options.from.email
        ).trim()
      )
        throw new Error('Cloudflare email sender is required')
      const value =
        typeof environment === 'object' && environment !== null
          ? (environment as Record<string, unknown>)[options.binding]
          : undefined
      if (
        !value ||
        typeof value !== 'object' ||
        !('send' in value) ||
        typeof value.send !== 'function'
      )
        throw new Error(`Email binding ${options.binding} is missing`)
      const binding = value as SendEmail
      return {
        emailProvider: {
          async send(message: EmailMessage) {
            await binding.send({
              from: address(message.from ?? options.from),
              to: (Array.isArray(message.to)
                ? message.to
                : [message.to as EmailAddress]
              ).map(address),
              subject: message.subject,
              ...(message.replyTo ? { replyTo: address(message.replyTo) } : {}),
              ...(message.text !== undefined ? { text: message.text } : {}),
              ...(message.html !== undefined ? { html: message.html } : {}),
            })
          },
        },
      }
    },
  }
}
