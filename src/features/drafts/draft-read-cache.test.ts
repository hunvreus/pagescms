import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DraftReadCache,
  connectDraftReadCache,
  draftReadCache,
  publishDraftChange,
} from './draft-read-cache'
import type { ContentDraft } from './draft-store'

afterEach(() => vi.restoreAllMocks())

describe('local draft read cache', () => {
  it('distinguishes an uncached draft from a confirmed absence', () => {
    const cache = new DraftReadCache()
    expect(cache.get('entry')).toBeUndefined()
    cache.set('entry', undefined)
    expect(cache.get('entry')).toEqual({ value: undefined })
    cache.invalidate(['entry'])
    expect(cache.get('entry')).toBeUndefined()
  })

  it('bounds snapshots to 50, keeps recently used entries, and expires after 15 minutes', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0)
    const cache = new DraftReadCache()
    for (let index = 0; index < 50; index++) cache.set(String(index), undefined)
    cache.get('0')
    cache.set('50', undefined)
    expect(cache.get('1')).toBeUndefined()
    expect(cache.get('0')).toBeDefined()
    clock.mockReturnValue(15 * 60_000)
    expect(cache.get('0')).toBeUndefined()
  })

  it('isolates cached values and invalidates only changed keys', () => {
    const cache = new DraftReadCache()
    const draft: ContentDraft = {
      key: 'entry',
      revision: 1,
      schema: 'schema',
      baseSha: 'sha',
      base: { value: { title: 'Original' } },
      value: { title: 'Draft' },
    }
    cache.set('entry', draft)
    cache.set('other', undefined)
    ;(draft.value as { title: string }).title = 'Changed'
    const first = cache.get<{ title: string }>('entry')!
    first.value!.value.title = 'Changed again'
    expect(cache.get('entry')!.value!.value).toEqual({ title: 'Draft' })
    cache.invalidate(['other'])
    expect(cache.get('entry')).toBeDefined()
    expect(cache.get('other')).toBeUndefined()
    cache.invalidate()
    expect(cache.get('entry')).toBeUndefined()
  })

  it('invalidates cross-tab changes and focus without rebroadcasting received messages', () => {
    const target = new EventTarget()
    const postMessage = vi.fn()
    let receive: ((event: MessageEvent<unknown>) => void) | undefined
    class Channel {
      postMessage = postMessage
      set onmessage(listener: (event: MessageEvent<unknown>) => void) {
        receive = listener
      }
    }
    vi.stubGlobal('window', target)
    vi.stubGlobal('BroadcastChannel', Channel)
    const changed = vi.fn()
    target.addEventListener('pagescms:drafts', changed)
    try {
      connectDraftReadCache()
      draftReadCache.set('entry', undefined)
      draftReadCache.set('other', undefined)
      receive!(new MessageEvent('message', { data: ['entry'] }))
      expect(draftReadCache.get('entry')).toBeUndefined()
      expect(draftReadCache.get('other')).toBeDefined()
      expect(changed).toHaveBeenCalledOnce()
      expect(postMessage).not.toHaveBeenCalled()
      publishDraftChange(['other'])
      expect(postMessage).toHaveBeenCalledWith(['other'])
      expect(draftReadCache.get('other')).toBeUndefined()
      draftReadCache.set('entry', undefined)
      target.dispatchEvent(new Event('focus'))
      expect(draftReadCache.get('entry')).toBeUndefined()
      postMessage.mockImplementation(() => {
        throw new Error('Unavailable')
      })
      expect(() => publishDraftChange(['entry'])).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
      draftReadCache.invalidate()
    }
  })
})
