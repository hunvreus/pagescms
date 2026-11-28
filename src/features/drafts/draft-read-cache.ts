import type { ContentDraft } from './draft-store'

// Cache records, not editor sessions: every editor still gets the current
// server baseline, schema checks, and IndexedDB revision protection.
export class DraftReadCache {
  private entries = new Map<
    string,
    { value: ContentDraft | undefined; expires: number }
  >()
  version = 0

  get<T>(key: string) {
    const entry = this.entries.get(key)
    if (!entry) return
    if (entry.expires <= Date.now()) {
      this.entries.delete(key)
      return
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return {
      value: structuredClone(entry.value) as ContentDraft<T> | undefined,
    }
  }

  set(key: string, value: ContentDraft | undefined) {
    this.entries.delete(key)
    this.entries.set(key, {
      value: structuredClone(value),
      expires: Date.now() + 15 * 60_000,
    })
    while (this.entries.size > 50)
      this.entries.delete(this.entries.keys().next().value!)
  }

  invalidate(keys?: string[]) {
    this.version++
    if (keys) for (const key of keys) this.entries.delete(key)
    else this.entries.clear()
  }
}

export const draftReadCache = new DraftReadCache()
let connected = false
let channel: BroadcastChannel | undefined

export function connectDraftReadCache() {
  if (connected) return
  connected = true
  window.addEventListener('focus', () => draftReadCache.invalidate())
  try {
    channel = new BroadcastChannel('pagescms:drafts')
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!Array.isArray(data) || !data.every((key) => typeof key === 'string'))
        return
      draftReadCache.invalidate(data)
      window.dispatchEvent(new Event('pagescms:drafts'))
    }
  } catch {
    // Focus still invalidates snapshots where cross-tab messaging is unavailable.
  }
}

export function publishDraftChange(keys: string[]) {
  connectDraftReadCache()
  draftReadCache.invalidate(keys)
  try {
    channel?.postMessage(keys)
  } catch {
    // Messaging failure must not turn a committed IndexedDB write into a failure.
  }
  window.dispatchEvent(new Event('pagescms:drafts'))
}
