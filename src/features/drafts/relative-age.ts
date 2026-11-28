export function relativeAge(savedAt: number, now = Date.now(), locale = 'en') {
  const elapsed = Math.max(0, now - savedAt)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [duration, unit] of [
    [86400000, 'day'],
    [3600000, 'hour'],
    [60000, 'minute'],
  ] as const) {
    if (elapsed >= duration)
      return formatter.format(-Math.floor(elapsed / duration), unit)
  }
  return formatter.format(0, 'second')
}
