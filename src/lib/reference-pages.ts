export interface ReferencePage {
  options: Array<{ value: string; label: string }>
  cursor?: string
}
/** Resolve selections across bounded pages; callers cancel work on navigation. */
export async function selectedReferenceOptions(
  fetchPage: (cursor?: string) => Promise<ReferencePage>,
  selected: string[],
  cancelled = () => false,
) {
  const options = new Map<string, { value: string; label: string }>()
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    if (cancelled()) return [...options.values()]
    const page = await fetchPage(cursor)
    for (const option of page.options) options.set(option.value, option)
    cursor = page.cursor
    if (cursor && seen.has(cursor))
      throw new Error('Reference pagination did not advance')
    if (cursor) seen.add(cursor)
  } while (cursor && selected.some((value) => !options.has(value)))
  return [...options.values()]
}
