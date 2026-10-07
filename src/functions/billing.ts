import { createServerFn } from '@tanstack/react-start'

export function parseBillingRequest(input: unknown): {
  intent: 'checkout' | 'portal'
  idempotencyKey: string
  priceId?: string
} {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid billing request')
  const value = input as Record<string, unknown>
  if (
    (value.intent !== 'checkout' && value.intent !== 'portal') ||
    typeof value.idempotencyKey !== 'string' ||
    !/^[a-zA-Z0-9-]{16,100}$/.test(value.idempotencyKey) ||
    (value.intent === 'checkout' &&
      (typeof value.priceId !== 'string' ||
        !value.priceId ||
        value.priceId.length > 200))
  )
    throw new Error('Invalid billing request')
  return {
    intent: value.intent,
    idempotencyKey: value.idempotencyKey,
    ...(value.intent === 'checkout'
      ? { priceId: value.priceId as string }
      : {}),
  }
}

export const createBillingSession = createServerFn({ method: 'POST' })
  .validator(parseBillingRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    if (!services.billingSessions) throw new Error('Billing is not configured')
    // Account identity and return URL are never supplied by the browser. Recovery
    // remains available even when a subscription no longer allows mutations.
    return services.billingSessions.create({
      ...data,
      accountId: session.user.id,
      email: session.user.email,
    })
  })
