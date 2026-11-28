import { describe, expect, it } from 'vitest'
import { defineConfig } from './config'
import { smtp } from './smtp'
import factory from './smtp.server'

describe('packaged SMTP plugin', () => {
  it('registers through the same descriptor and rejects Cloudflare before runtime', () => {
    expect(smtp().id).toBe('smtp-email')
    expect(() =>
      defineConfig({ target: 'cloudflare', plugins: [smtp()] }),
    ).toThrow()
    expect(smtp().server).toMatch(/src\/package\/smtp.server.ts$/)
  })

  it('reads runtime configuration without opening a connection', () => {
    const plugin = factory({})
    expect(
      plugin.create({ SMTP_HOST: 'localhost', SMTP_FROM: 'cms@example.test' })
        .emailProvider?.send,
    ).toBeTypeOf('function')
    expect(() =>
      plugin.create({
        SMTP_HOST: 'localhost',
        SMTP_FROM: 'cms@example.test',
        SMTP_USER: 'user',
      }),
    ).toThrow('SMTP_PASSWORD')
    expect(() =>
      plugin.create({
        SMTP_HOST: 'localhost',
        SMTP_FROM: 'cms@example.test',
        SMTP_PORT: 'bad',
      }),
    ).toThrow('Invalid SMTP port')
    expect(() =>
      plugin.create({
        SMTP_HOST: 'localhost',
        SMTP_FROM: 'cms@example.test',
        SMTP_SECURE: 'maybe',
      }),
    ).toThrow('SMTP_SECURE')
  })
})
