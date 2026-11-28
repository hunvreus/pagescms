import { z } from 'zod'

const code = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Use a path-safe locale code')
const locale = z.union([
  code,
  z.object({ code, label: z.string().min(1).optional() }).strict(),
])
const locales = z.array(locale).min(1).max(50)
const folder = z
  .object({
    type: z.literal('folder'),
    position: z.enum(['root', 'collection', 'parent', 'custom']),
    after: z.string().optional(),
    default: z.enum(['omit', 'explicit']).optional(),
  })
  .strict()
const filename = z
  .object({
    type: z.literal('filename'),
    position: z.enum(['prefix', 'suffix']),
    separator: z.string().min(1).optional(),
    default: z.enum(['omit', 'explicit']).optional(),
  })
  .strict()

export const RepositoryI18nSchema = z
  .object({ default: code.optional(), locales })
  .strict()
export const ContentI18nSchema = z
  .object({
    scheme: z.enum(['files', 'fields']),
    default: code.optional(),
    locales: locales.optional(),
    path: z.discriminatedUnion('type', [filename, folder]).optional(),
  })
  .strict()
