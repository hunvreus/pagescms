import { validateStructuredContent } from '../../tests/field-validation'
import { describe, expect, it, vi } from 'vitest'
import { customFieldDefinition } from './registry'
import { initializeStructuredContent } from '#/lib/field-values'
import { transformContentFields } from '#/lib/content-field-values'

const hooks = vi.hoisted(() => ({
  editor: vi.fn(async () => ({ default: () => null })),
  read: vi.fn((value, _field, config) => `${config.prefix}${value}`),
  write: vi.fn((value, _field, config) => `${value}${config.suffix}`),
}))
vi.mock('#pagescms/deployment/client', async () => {
  const { definePagesCmsClientDeployment } =
    await import('#/deployment/contracts/client')
  const { DEPLOYMENT_API_VERSION } =
    await import('#/deployment/contracts/version')
  return {
    default: definePagesCmsClientDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      plugins: [
        {
          id: 'example',
          fields: {
            slug: {
              definition: {
                defaultValue: 'new',
                schema: () => ({
                  safeParse: (value) =>
                    typeof value === 'string'
                      ? { success: true, data: value }
                      : {
                          success: false,
                          error: { issues: [{ message: 'String required' }] },
                        },
                }),
                read: hooks.read,
                write: hooks.write,
              },
              editor: hooks.editor,
            },
          },
        },
      ],
    }),
  }
})

describe('registered field behavior', () => {
  it('uses the same registered definition for defaults, validation and read/write hooks', () => {
    const fields = [{ name: 'slug', type: 'slug' }]
    expect(initializeStructuredContent(fields)).toEqual({ slug: 'new' })
    expect(validateStructuredContent(fields, { slug: 123 })).toEqual([
      'slug: String required',
    ])
    const configuration = { prefix: 'read:', suffix: ':write' }
    expect(
      transformContentFields(fields, { slug: 'hello' }, 'read', {
        configuration,
      }),
    ).toEqual({ slug: 'read:hello' })
    expect(
      transformContentFields(fields, { slug: 'hello' }, 'write', {
        configuration,
      }),
    ).toEqual({ slug: 'hello:write' })
    expect(hooks.read).toHaveBeenCalledWith('hello', fields[0], configuration)
    expect(hooks.editor).not.toHaveBeenCalled()
    expect(customFieldDefinition('missing')).toBeUndefined()
  })
  it('validates registered component-only fields rather than bypassing validation', () => {
    expect(
      validateStructuredContent([{ name: 'slug', component: 'slug' }], {
        slug: 123,
      }),
    ).toEqual(['slug: String required'])
  })
})
