import { createResendEmailProvider } from '#/deployment/builtins/resend-email.server'
import type { ServerPlugin } from '../server'

// The default build may run without email; partial credentials still fail validation.
export function resendEmail(): ServerPlugin {
  return {
    id: 'resend-email',
    create: (environment) => ({
      emailProvider: createResendEmailProvider(environment),
    }),
  }
}
