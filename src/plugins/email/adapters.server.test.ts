import { describe, expect, it, vi } from 'vitest'
import { cloudflareEmail } from './cloudflare.server'
import { smtpEmail } from './smtp.server'
import { resendEmail } from './resend.server'

const { sendMail, createTransport } = vi.hoisted(() => {
  const send = vi.fn(async () => ({ rejected: [] as string[] }))
  return { sendMail: send, createTransport: vi.fn(() => ({ sendMail: send })) }
})
vi.mock('nodemailer', () => ({ default: { createTransport } }))

describe('email plugins', () => {
  it('allows the default build without email and rejects partial Resend credentials', () => {
    expect(resendEmail().create({}).emailProvider).toBeUndefined()
    expect(() => resendEmail().create({ RESEND_API_KEY: 'test' })).toThrow(
      'provided together',
    )
    expect(() =>
      cloudflareEmail({ binding: 'MAIL', from: '' }).create({
        MAIL: { send: vi.fn() },
      }),
    ).toThrow('sender is required')
  })
  it('maps recipients and unnamed addresses to the Cloudflare binding', async () => {
    const send = vi.fn(async () => ({}))
    const services = cloudflareEmail({
      binding: 'MAIL',
      from: 'cms@example.com',
    }).create({ MAIL: { send } })
    await services.emailProvider!.send({
      to: [{ email: 'a@example.com' }, { email: 'b@example.com', name: 'B' }],
      replyTo: { email: 'reply@example.com' },
      subject: 'Invitation',
      text: 'Hello',
      html: '<p>Hello</p>',
    })
    expect(send).toHaveBeenCalledWith({
      from: 'cms@example.com',
      to: ['a@example.com', { email: 'b@example.com', name: 'B' }],
      replyTo: 'reply@example.com',
      subject: 'Invitation',
      text: 'Hello',
      html: '<p>Hello</p>',
    })
  })
  it('fails clearly for a missing binding and propagates delivery errors', async () => {
    const plugin = cloudflareEmail({ binding: 'MAIL', from: 'cms@example.com' })
    expect(() => plugin.create({})).toThrow('binding MAIL is missing')
    const services = plugin.create({
      MAIL: {
        send: async () => {
          throw new Error('Delivery failed')
        },
      },
    })
    await expect(
      services.emailProvider!.send({
        to: 'a@example.com',
        subject: 'Hello',
        text: 'Hi',
      }),
    ).rejects.toThrow('Delivery failed')
  })
  it('uses SMTP STARTTLS defaults and maps core addresses without attachments', async () => {
    const services = smtpEmail({
      host: 'smtp.example.com',
      from: { email: 'cms@example.com', name: 'CMS' },
    }).create({})
    await services.emailProvider!.send({
      to: { email: 'a@example.com' },
      subject: 'Hello',
      text: 'Hi',
    })
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        port: 587,
        secure: false,
        requireTLS: true,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    )
    expect(sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: { address: 'cms@example.com', name: 'CMS' },
        to: [{ address: 'a@example.com', name: '' }],
      }),
    )
  })
  it('surfaces partial SMTP delivery failures', async () => {
    sendMail.mockResolvedValueOnce({ rejected: ['a@example.com'] })
    const services = smtpEmail({
      host: 'smtp.example.com',
      secure: true,
      from: 'cms@example.com',
    }).create({})
    await expect(
      services.emailProvider!.send({
        to: 'a@example.com',
        subject: 'Hello',
        text: 'Hi',
      }),
    ).rejects.toThrow('rejected')
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false }),
    )
  })
})
