import { smtpEmail } from '#/plugins/email/smtp.server'
import type { JsonObject } from '#/shared/json'

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${name} is required`)
  return value
}

export default function smtp(options: JsonObject) {
  return smtpEmail((environment) => {
    const env = environment as Record<string, unknown>
    const port = Number(options.port ?? env.SMTP_PORT ?? 587)
    const user = env.SMTP_USER
    const pass = env.SMTP_PASSWORD
    const secure =
      options.secure ??
      (env.SMTP_SECURE === undefined
        ? port === 465
        : env.SMTP_SECURE === 'true')
    if (
      env.SMTP_SECURE !== undefined &&
      !['true', 'false'].includes(String(env.SMTP_SECURE))
    ) {
      throw new Error('SMTP_SECURE must be true or false')
    }
    if (
      typeof secure !== 'boolean' ||
      (Object.hasOwn(options, 'requireTLS') &&
        typeof options.requireTLS !== 'boolean')
    ) {
      throw new Error('SMTP secure and requireTLS options must be boolean')
    }
    return {
      host: text(options.host ?? env.SMTP_HOST, 'SMTP_HOST'),
      from: text(options.from ?? env.SMTP_FROM, 'SMTP_FROM'),
      port,
      secure,
      ...(!Object.hasOwn(options, 'requireTLS')
        ? {}
        : { requireTLS: Boolean(options.requireTLS) }),
      ...(user === undefined && pass === undefined
        ? {}
        : {
            auth: {
              user: text(user, 'SMTP_USER'),
              pass: text(pass, 'SMTP_PASSWORD'),
            },
          }),
    }
  })
}
