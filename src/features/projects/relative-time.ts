const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const units = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
] as const

export function relativeTime(value: string | number, now = Date.now()) {
  const timestamp =
    typeof value === 'number' ? value * 1_000 : Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  const seconds = Math.round((timestamp - now) / 1_000)
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit)
    }
  }
  return formatter.format(seconds, 'second')
}
