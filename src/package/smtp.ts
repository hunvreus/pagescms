import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { definePlugin } from './config'

export interface SmtpConfiguration {
  host?: string
  port?: number
  secure?: boolean
  requireTLS?: boolean
  from?: string
}

/** Credentials are read from SMTP_USER / SMTP_PASSWORD at runtime. */
export function smtp(options: SmtpConfiguration = {}) {
  return definePlugin({
    id: 'smtp-email',
    targets: ['node'],
    server: resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../src/package/smtp.server.ts',
    ),
    options: { ...options },
  })
}
