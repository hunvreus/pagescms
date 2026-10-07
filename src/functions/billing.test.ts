import { describe, it, expect, vi } from 'vitest'
import { createBillingSession, parseBillingRequest } from './billing'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validate: (data: unknown) => unknown) => ({
      handler:
        (handle: (input: unknown) => unknown) =>
        (input: { context: unknown; data: unknown }) =>
          handle({ ...input, data: validate(input.data) }),
    }),
  }),
}))
describe('billing requests', () => {
  it('uses only intent, configured-price identifier and idempotency key from the caller', () => {
    expect(
      parseBillingRequest({
        intent: 'checkout',
        priceId: 'price_pro',
        idempotencyKey: '12345678-abcd-1234',
        accountId: 'other',
        returnUrl: 'https://evil.example',
      }),
    ).toEqual({
      intent: 'checkout',
      priceId: 'price_pro',
      idempotencyKey: '12345678-abcd-1234',
    })
    expect(() =>
      parseBillingRequest({
        intent: 'checkout',
        idempotencyKey: '12345678-abcd-1234',
      }),
    ).toThrow('Invalid billing request')
    expect(() =>
      parseBillingRequest({ intent: 'portal', idempotencyKey: 'invalid' }),
    ).toThrow('Invalid billing request')
  })
})

const invoke = createBillingSession as unknown as (input: {
  context: unknown
  data: unknown
}) => Promise<unknown>
describe('authenticated billing handler', () => {
  it('uses the session account and drops caller-supplied identity and redirects', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ url: 'https://checkout.stripe.com/test' })
    const services = {
      getSession: async () => ({
        user: { id: 'trusted', email: 'trusted@example.com' },
      }),
      billingSessions: { create },
    }
    await invoke({
      context: { getServices: () => services },
      data: {
        intent: 'checkout',
        priceId: 'price_pro',
        idempotencyKey: '12345678-abcd-1234',
        accountId: 'victim',
        email: 'victim@example.com',
        returnUrl: 'https://evil.example',
      },
    })
    expect(create).toHaveBeenCalledExactlyOnceWith({
      intent: 'checkout',
      priceId: 'price_pro',
      idempotencyKey: '12345678-abcd-1234',
      accountId: 'trusted',
      email: 'trusted@example.com',
    })
  })
  it('rejects anonymous requests and unavailable billing before creating a session', async () => {
    const create = vi.fn()
    const data = { intent: 'portal', idempotencyKey: '12345678-abcd-1234' }
    await expect(
      invoke({
        context: {
          getServices: () => ({
            getSession: async () => null,
            billingSessions: { create },
          }),
        },
        data,
      }),
    ).rejects.toThrow('Authentication required')
    await expect(
      invoke({
        context: {
          getServices: () => ({
            getSession: async () => ({ user: { id: 'trusted' } }),
          }),
        },
        data,
      }),
    ).rejects.toThrow('Billing is not configured')
    expect(create).not.toHaveBeenCalled()
  })
})
