export const HISTORY_PAGE_SIZE = 10

export function historyPage(value: unknown) {
  if (value === undefined) return 1
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('History page must be a positive integer')
  }
  return value
}
