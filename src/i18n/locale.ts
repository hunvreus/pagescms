export const locales = ['en', 'fr', 'es', 'pt-BR', 'zh-CN'] as const
export type Locale = (typeof locales)[number]
export const localeLabels: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  'zh-CN': '简体中文',
}
export const localeCookie = 'pagescms-language'
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (locales as readonly string[]).includes(value)
  )
}
export function preferredLocale(
  profile: unknown,
  cookie: unknown,
  acceptLanguage = '',
): Locale | undefined {
  if (isLocale(profile)) return profile
  if (isLocale(cookie)) return cookie
  const preferences = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().toLowerCase().split(';')
      const quality = parameters.find((value) => value.trim().startsWith('q='))
      const weight = quality ? Number(quality.trim().slice(2)) : 1
      return { tag, weight, index }
    })
    .filter(
      ({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1,
    )
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  for (const { tag } of preferences) {
    if (tag === 'pt-br' || tag === 'pt') return 'pt-BR'
    if (
      tag === 'zh' ||
      tag === 'zh-cn' ||
      tag === 'zh-sg' ||
      tag === 'zh-hans' ||
      tag.startsWith('zh-hans-')
    )
      return 'zh-CN'
    const primary = tag.split('-')[0]
    if (primary === 'en' || primary === 'fr' || primary === 'es') return primary
  }
  return undefined
}
