import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { EmailAddress } from '#/server/email/email'
import type { ServerPlugin } from '../server'

export interface SmtpOptions {
  host: string
  port?: number
  secure?: boolean
  requireTLS?: boolean
  auth?: { user: string; pass: string }
  from: EmailAddress
}

function address(value: EmailAddress) {
  return typeof value === 'string'
    ? value
    : { address: value.email, name: value.name ?? '' }
}

/** Node.js transport; select the binding adapter for Cloudflare Workers. */
export function smtpEmail(
  configuration: SmtpOptions | ((environment: unknown) => SmtpOptions),
): ServerPlugin {
  return {
    id: 'smtp-email',
    create(environment) {
      const options =
        typeof configuration === 'function'
          ? configuration(environment)
          : configuration
      if (!options.host || !options.from)
        throw new Error('SMTP host and sender are required')
      if (
        options.port !== undefined &&
        (!Number.isInteger(options.port) ||
          options.port < 1 ||
          options.port > 65535)
      )
        throw new Error('Invalid SMTP port')
      const transportOptions: SMTPTransport.Options = {
        host: options.host,
        port: options.port ?? (options.secure ? 465 : 587),
        secure: options.secure ?? false,
        requireTLS: options.requireTLS ?? !options.secure,
        auth: options.auth,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      }
      return {
        emailProvider: {
          async send(message) {
            const { default: nodemailer } = await import('nodemailer')
            const transport = nodemailer.createTransport(transportOptions)
            const recipients = Array.isArray(message.to)
              ? message.to
              : [message.to as EmailAddress]
            const result = await transport.sendMail({
              from: address(message.from ?? options.from),
              to: recipients.map(address),
              subject: message.subject,
              text: message.text,
              html: message.html,
              ...(message.replyTo ? { replyTo: address(message.replyTo) } : {}),
            })
            // SMTP may partially deliver a multi-recipient message. Core notifications
            // send one recipient at a time; callers must not blindly retry a batch.
            if (result.rejected.length)
              throw new Error('SMTP rejected one or more recipients')
          },
        },
      }
    },
  }
}
