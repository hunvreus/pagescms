import {
  getGitFileName,
  getGitParentPath,
  isGitPathWithin,
  joinGitPath,
  normalizeGitPath,
} from '#/shared/git-path'

export interface Locale {
  code: string
  label: string
}
export interface LocaleSettings {
  default: string
  locales: Locale[]
}
export type LocalePath =
  | {
      type: 'filename'
      position: 'prefix' | 'suffix'
      separator: string
      default: 'omit' | 'explicit'
    }
  | {
      type: 'folder'
      position: 'root' | 'collection' | 'parent' | 'custom'
      after?: string
      default: 'omit' | 'explicit'
    }
export interface ContentI18n extends LocaleSettings {
  scheme: 'files' | 'fields'
  path?: LocalePath
}
export type I18nSchema = Record<string, unknown> & {
  path?: unknown
  type?: unknown
  i18n?: unknown
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const languageNames = new Map<string, Intl.DisplayNames>()

export function localeLabel(code: string, language = 'en') {
  try {
    let names = languageNames.get(language)
    if (!names) {
      names = new Intl.DisplayNames([language], { type: 'language' })
      languageNames.set(language, names)
    }
    return names.of(code.replaceAll('_', '-')) ?? code
  } catch {
    return code
  }
}

export function isContentLocaleCode(code: unknown): code is string {
  return (
    typeof code === 'string' &&
    /^[A-Za-z][A-Za-z0-9_-]*$/.test(code) &&
    !['constructor', 'prototype', '__proto__'].includes(code)
  )
}

export function resolveLocales(
  value: unknown,
  inherited?: LocaleSettings,
): LocaleSettings {
  const settings = record(value) ? value : {}
  const locales = Array.isArray(settings.locales)
    ? settings.locales.map((entry): Locale => {
        const code =
          typeof entry === 'string'
            ? entry
            : record(entry) && typeof entry.code === 'string'
              ? entry.code
              : ''
        if (!isContentLocaleCode(code))
          throw new Error(`Invalid locale code: ${code}`)
        const previous = inherited?.locales.find(
          (locale) => locale.code === code,
        )
        const label =
          record(entry) && typeof entry.label === 'string'
            ? entry.label
            : (previous?.label ?? localeLabel(code))
        return { code, label }
      })
    : (inherited?.locales ?? [])
  if (!locales.length || locales.length > 50)
    throw new Error('i18n.locales must contain between 1 and 50 locales')
  if (
    new Set(locales.map((locale) => locale.code.toLowerCase())).size !==
    locales.length
  )
    throw new Error('i18n.locales must be unique, including letter case')
  const defaultLocale =
    typeof settings.default === 'string'
      ? settings.default
      : (inherited?.default ?? locales[0].code)
  if (!locales.some((locale) => locale.code === defaultLocale))
    throw new Error(
      'The default locale must belong to i18n.locales; specify a local default when overriding the list',
    )
  return { default: defaultLocale, locales }
}

export function contentI18n(schema: I18nSchema): ContentI18n | undefined {
  return record(schema.i18n) &&
    (schema.i18n.scheme === 'files' || schema.i18n.scheme === 'fields')
    ? (schema.i18n as unknown as ContentI18n)
    : undefined
}

export function normalizeContentI18n(schema: I18nSchema, global: unknown) {
  if (!schema.i18n) return
  if (!record(schema.i18n))
    throw new Error('Content i18n must specify a scheme')
  const config = schema.i18n
  schema.path = normalizeGitPath(String(schema.path ?? ''))
  const settings = resolveLocales(
    config,
    global ? resolveLocales(global) : undefined,
  )
  if (config.scheme !== 'files' && config.scheme !== 'fields')
    throw new Error('i18n.scheme must be files or fields')
  if (config.scheme === 'fields') {
    if (config.path !== undefined)
      throw new Error('i18n.path applies only to the files scheme')
    const format = String(schema.format ?? '')
    if (
      ![
        'yaml',
        'json',
        'toml',
        'yaml-frontmatter',
        'json-frontmatter',
        'toml-frontmatter',
      ].includes(format)
    )
      throw new Error('The fields scheme requires a structured content format')
  } else {
    if (!record(config.path))
      throw new Error('The files scheme requires i18n.path')
    const path = config.path
    if (path.default === undefined) path.default = 'explicit'
    if (!['omit', 'explicit'].includes(String(path.default)))
      throw new Error('i18n.path.default must be omit or explicit')
    if (path.type === 'filename') {
      if (!['prefix', 'suffix'].includes(String(path.position)))
        throw new Error('Filename position must be prefix or suffix')
      if (path.separator === undefined) path.separator = '.'
      if (
        typeof path.separator !== 'string' ||
        !/^[._-]+$/.test(path.separator)
      )
        throw new Error(
          'Filename separator must contain only dots, underscores or hyphens',
        )
      for (const a of settings.locales)
        for (const b of settings.locales) {
          if (
            a.code !== b.code &&
            (path.position === 'suffix'
              ? a.code.endsWith(String(path.separator) + b.code)
              : a.code.startsWith(b.code + String(path.separator)))
          )
            throw new Error(
              'Locale codes overlap with the filename separator; choose another separator',
            )
        }
    } else if (path.type === 'folder') {
      if (
        !['root', 'collection', 'parent', 'custom'].includes(
          String(path.position),
        )
      )
        throw new Error(
          'Folder position must be root, collection, parent or custom',
        )
      if (path.position === 'collection' && schema.type !== 'collection')
        throw new Error(
          'Folder position collection requires a collection; use parent for a fixed file',
        )
      if (path.position === 'custom') {
        if (
          typeof path.after !== 'string' ||
          !path.after ||
          normalizeGitPath(path.after) !== path.after ||
          !isGitPathWithin(path.after, String(schema.path))
        )
          throw new Error(
            'Custom after must be an exact ancestor directory of the content path',
          )
        if (schema.type === 'file' && path.after === schema.path)
          throw new Error(
            'Custom after must be a directory, not the content file',
          )
      } else if (path.after !== undefined)
        throw new Error('after is only valid for custom folder positioning')
    } else throw new Error('i18n.path.type must be filename or folder')
  }
  schema.i18n = { ...config, ...settings }
}

export function assertLocalizedFields(schema: I18nSchema) {
  const settings = contentI18n(schema)
  const walk = (node: Record<string, unknown>, wrapped: boolean, depth = 0) => {
    if (node.localized !== undefined && settings?.scheme !== 'fields')
      throw new Error('localized is only valid with i18n.scheme: fields')
    if (wrapped && node.localized !== undefined)
      throw new Error(
        'A localized container already includes its children; remove descendant localized flags',
      )
    const next = wrapped || node.localized === true
    if (
      next &&
      node.name === 'body' &&
      depth === 1 &&
      String(schema.format).endsWith('-frontmatter')
    )
      throw new Error(
        'The raw Markdown body cannot be localized within one file; use separate files or a structured rich-text field',
      )
    for (const field of Array.isArray(node.fields) ? node.fields : [])
      if (record(field)) walk(field, next, depth + 1)
    for (const block of Array.isArray(node.blocks) ? node.blocks : [])
      if (record(block)) walk(block, next, depth + 1)
  }
  walk(schema, false)
}

function folderIndex(
  schema: I18nSchema,
  path: string,
  config: Extract<LocalePath, { type: 'folder' }>,
) {
  if (config.position === 'root') return 0
  if (config.position === 'parent') return path.split('/').length - 1
  const anchor =
    config.position === 'collection' ? String(schema.path) : config.after!
  if (!isGitPathWithin(anchor, path))
    throw new Error('Locale folder anchor is outside the entry path')
  return anchor ? anchor.split('/').length : 0
}

/** Canonical paths omit the locale decoration; all grouping uses the full path. */
function uncheckedLocalizedPath(
  schema: I18nSchema,
  canonical: string,
  locale: string,
) {
  const settings = contentI18n(schema)
  const path = normalizeGitPath(canonical)
  if (!settings) return path
  if (!settings.locales.some((item) => item.code === locale))
    throw new Error('Unknown content locale')
  if (settings.scheme === 'fields') return path
  const config = settings.path!
  if (locale === settings.default && config.default === 'omit') return path
  if (config.type === 'filename') {
    const filename = getGitFileName(path)
    const dot = filename.lastIndexOf('.')
    const name = dot > 0 ? filename.slice(0, dot) : filename
    const extension = dot > 0 ? filename.slice(dot) : ''
    const decorated =
      config.position === 'prefix'
        ? `${locale}${config.separator}${name}`
        : `${name}${config.separator}${locale}`
    return joinGitPath(getGitParentPath(path), decorated + extension)
  }
  const segments = path.split('/')
  segments.splice(folderIndex(schema, path, config), 0, locale)
  return segments.join('/')
}

export function localizedPath(
  schema: I18nSchema,
  canonical: string,
  locale: string,
) {
  const normalized = normalizeGitPath(canonical)
  const result = uncheckedLocalizedPath(schema, normalized, locale)
  if (contentI18n(schema)?.scheme === 'files') {
    const config = contentI18n(schema)!
    if (config.path?.default === 'omit') {
      const plain = parseLocalizedPath(schema, normalized)
      if (
        !plain ||
        plain.locale !== config.default ||
        plain.canonical !== normalized
      )
        throw new Error(
          'The filename or folder conflicts with a reserved locale name',
        )
    }
    const parsed = parseLocalizedPath(schema, result)
    if (!parsed || parsed.locale !== locale || parsed.canonical !== normalized)
      throw new Error(
        'The filename or folder conflicts with a reserved locale name',
      )
  }
  return result
}

export function parseLocalizedPath(
  schema: I18nSchema,
  input: string,
): { locale: string; canonical: string } | undefined {
  const settings = contentI18n(schema)
  if (!settings || settings.scheme !== 'files') return
  const physical = normalizeGitPath(input)
  const config = settings.path!
  const candidates = [...settings.locales].sort(
    (a, b) => b.code.length - a.code.length,
  )
  let reserved = false
  for (const { code } of candidates) {
    let canonical: string | undefined
    if (config.type === 'filename') {
      const filename = getGitFileName(physical)
      const dot = filename.lastIndexOf('.')
      const stem = dot > 0 ? filename.slice(0, dot) : filename
      const extension = dot > 0 ? filename.slice(dot) : ''
      const token =
        config.position === 'prefix'
          ? code + config.separator
          : config.separator + code
      if (
        config.position === 'prefix'
          ? stem.startsWith(token)
          : stem.endsWith(token)
      ) {
        const base =
          config.position === 'prefix'
            ? stem.slice(token.length)
            : stem.slice(0, -token.length)
        if (base)
          canonical = joinGitPath(getGitParentPath(physical), base + extension)
      }
    } else {
      const segments = physical.split('/')
      // Parent placement's locale directory adds one segment before the filename.
      const index =
        config.position === 'parent'
          ? segments.length - 2
          : config.position === 'root'
            ? 0
            : config.position === 'collection'
              ? String(schema.path).split('/').filter(Boolean).length
              : config.after!.split('/').length
      if (segments[index] === code) {
        segments.splice(index, 1)
        canonical = segments.join('/')
      }
    }
    if (canonical) reserved = true
    if (
      canonical &&
      isCanonicalEntry(schema, canonical) &&
      uncheckedLocalizedPath(schema, canonical, code) === physical
    )
      return { locale: code, canonical }
  }
  if (
    !reserved &&
    config.default === 'omit' &&
    isCanonicalEntry(schema, physical)
  )
    return { locale: settings.default, canonical: physical }
}

export function isCanonicalEntry(schema: I18nSchema, path: string) {
  const root = normalizeGitPath(String(schema.path ?? ''))
  return schema.type === 'file'
    ? path === root
    : path !== root && isGitPathWithin(root, path)
}

export function canonicalEntryPath(schema: I18nSchema, path: string) {
  const config = contentI18n(schema)
  if (config?.scheme === 'files') {
    const parsed = parseLocalizedPath(schema, path)
    if (!parsed)
      throw new Error('Entry path does not match its configured locale path')
    return parsed.canonical
  }
  const normalized = normalizeGitPath(path)
  if (!isCanonicalEntry(schema, normalized))
    throw new Error('Entry path is outside its configured content root')
  return normalized
}

export function localeDirectory(
  schema: I18nSchema,
  directory: string,
  locale: string,
) {
  return getGitParentPath(
    uncheckedLocalizedPath(
      schema,
      joinGitPath(directory, '__entry__.md'),
      locale,
    ),
  )
}
