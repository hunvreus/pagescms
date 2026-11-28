// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DraftSession } from './draft-session'
import { draftReadCache } from './draft-read-cache'
import type { ContentDraft, EntrySummary } from './draft-store'

const store = vi.hoisted(() => ({
  drafts: new Map<string, ContentDraft>(),
  opened: vi.fn(),
  writes: vi.fn(),
  readError: null as Error | null,
}))
vi.mock('./draft-store', () => ({
  readDraft: async (key: string) => {
    if (store.readError) throw store.readError
    return structuredClone(store.drafts.get(key))
  },
  recordOpened: store.opened,
  writeDraft: async (
    draft: Omit<ContentDraft, 'revision'>,
    revision: number,
  ) => {
    store.writes()
    if ((store.drafts.get(draft.key)?.revision ?? 0) !== revision)
      throw new Error('Draft changed in another tab')
    store.drafts.set(
      draft.key,
      structuredClone({ ...draft, revision: revision + 1 }),
    )
    return revision + 1
  },
  discardDraft: async (key: string, revision: number) => {
    const current = store.drafts.get(key)
    if (current && current.revision !== revision)
      throw new Error('Draft changed in another tab')
    store.drafts.delete(key)
  },
}))
const summary: EntrySummary = {
  key: 'entry',
  account: 'editor',
  source: 'github',
  target: {
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    name: 'posts',
    path: 'content/post.md',
  },
  title: 'Original',
  href: '/github/owner/repo/main/collection/posts/entry/content/post.md',
  updatedAt: 1,
}
const create = (
  value = 'Original',
  sha = 'original-sha',
  dispose = vi.fn(),
  schema = 'schema',
) =>
  new DraftSession(
    'entry',
    schema,
    summary,
    value,
    sha,
    (title) => title,
    dispose,
  )

beforeEach(() => {
  draftReadCache.invalidate()
  store.drafts.clear()
  store.readError = null
  store.opened.mockReset().mockResolvedValue(undefined)
  store.writes.mockReset()
})
describe('draft session acknowledgement', () => {
  it('rechecks storage on an explicit retry even if the draft has not changed', async () => {
    const session = create()
    await session.load()
    session.setValue('Local changes')
    await session.flush()
    session.localError(new Error('Storage unavailable'))
    await session.flushForSave()
    expect(store.writes).toHaveBeenCalledTimes(2)
    expect(session.getSnapshot().error).toBeNull()
  })
  it('pauses background writes after an error until an explicit save retry', async () => {
    vi.useFakeTimers()
    try {
      const session = create()
      await session.load()
      session.setValue('Unsaved')
      store.drafts.set('entry', {
        key: 'entry',
        revision: 1,
        schema: 'schema',
        baseSha: 'original-sha',
        base: { value: 'Original' },
        value: 'Other tab',
      })
      await expect(session.flush()).rejects.toThrow(
        'Draft changed in another tab',
      )
      expect(store.writes).toHaveBeenCalledTimes(1)
      session.setValue('More edits')
      await vi.advanceTimersByTimeAsync(1000)
      expect(store.writes).toHaveBeenCalledTimes(1)
      await expect(session.flush()).rejects.toThrow(
        'Draft changed in another tab',
      )
      expect(store.writes).toHaveBeenCalledTimes(1)
      await expect(session.flushForSave()).rejects.toThrow(
        'Draft changed in another tab',
      )
      expect(store.writes).toHaveBeenCalledTimes(2)
      expect(session.getSnapshot().value).toBe('More edits')
    } finally {
      vi.useRealTimers()
    }
  })
  it('requests attention for a failed save and only handles it while an editor is open', async () => {
    const session = create()
    const unmount = session.mount()
    await session.load()
    session.setValue('Unsaved')
    store.drafts.set('entry', {
      key: 'entry',
      revision: 1,
      schema: 'schema',
      baseSha: 'original-sha',
      base: { value: 'Original' },
      value: 'Other tab',
    })
    const error = await session
      .flushForSave()
      .catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(session.getSnapshot().attentionRevision).toBe(1)
    expect(session.handlesVisibleError(error)).toBe(true)
    unmount()
    expect(session.handlesVisibleError(error)).toBe(false)
  })
  it('retains a storage read error when a clean session is flushed', async () => {
    store.readError = new Error('Draft storage unavailable')
    const session = create()
    await session.load()
    await session.flush()
    expect(session.getSnapshot().error).toBe(store.readError)
  })

  it('renders a warm clean entry synchronously using the latest server baseline', () => {
    draftReadCache.set('entry', undefined)
    const session = create('New server value', 'new-sha')
    expect(session.getSnapshot()).toMatchObject({
      ready: true,
      value: 'New server value',
      baseline: 'New server value',
      baseSha: 'new-sha',
    })
  })

  it('restores warm unsaved values synchronously without replacing their original base', () => {
    draftReadCache.set('entry', {
      key: 'entry',
      revision: 3,
      schema: 'schema',
      baseSha: 'old-sha',
      base: { value: 'Original' },
      value: 'Unsaved',
    })
    const session = create('New server value', 'new-sha')
    expect(session.getSnapshot()).toMatchObject({
      ready: true,
      dirty: true,
      value: 'Unsaved',
      baseline: 'New server value',
      baseSha: 'old-sha',
      base: { value: 'Original' },
    })
  })

  it('still blocks a cached draft when the schema is incompatible', () => {
    draftReadCache.set('entry', {
      key: 'entry',
      revision: 3,
      schema: 'old-schema',
      baseSha: 'sha',
      base: { value: 'Original' },
      value: 'Unsaved',
    })
    expect(create().getSnapshot()).toMatchObject({
      ready: false,
      value: 'Unsaved',
      error: expect.any(Error),
    })
  })
  it('reports the actual local save time across reloads without advancing it on unchanged flushes', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      const session = create()
      await session.load()
      expect(session.getSnapshot().savedAt).toBeNull()
      session.setValue('First edit')
      expect(session.getSnapshot().savedAt).toBeNull()
      await session.flush()
      expect(session.getSnapshot().savedAt).toBe(1_000)

      clock.mockReturnValue(4_000)
      session.setValue('Second edit')
      expect(session.getSnapshot().savedAt).toBe(1_000)
      await session.flush()
      expect(session.getSnapshot().savedAt).toBe(4_000)

      const restored = create()
      await restored.load()
      expect(restored.getSnapshot().savedAt).toBe(4_000)
      clock.mockReturnValue(10_000)
      await restored.flush()
      expect(restored.getSnapshot().savedAt).toBe(4_000)
      await restored.discard()
      expect(restored.getSnapshot().savedAt).toBeNull()

      const saved = create()
      await saved.load()
      saved.setValue('Saved edit')
      await saved.flush()
      await saved.acknowledge('Saved edit', 'Saved edit', 'saved-sha')
      expect(saved.getSnapshot().savedAt).toBeNull()
    } finally {
      clock.mockRestore()
    }
  })

  it('persists the original values and retains them when restoring against newer GitHub data', async () => {
    const first = create()
    await first.load()
    first.setValue('Local')
    await first.flush()
    expect(store.drafts.get('entry')?.base).toEqual({ value: 'Original' })
    const restored = create('GitHub changed it', 'remote-sha')
    await restored.load()
    expect(restored.getSnapshot()).toMatchObject({
      base: { value: 'Original' },
      baseline: 'GitHub changed it',
      value: 'Local',
      baseSha: 'original-sha',
    })
  })
  it('applies choices locally and saves the latest baseline for reload and a subsequent save', async () => {
    const first = create()
    await first.load()
    first.setValue('Local')
    await first.beginSave('Local')
    await first.applyMerge('Combined', 'Remote', 'remote-sha')
    expect(first.getSnapshot()).toMatchObject({
      value: 'Combined',
      baseline: 'Remote',
      base: { value: 'Remote' },
      baseSha: 'remote-sha',
      dirty: true,
    })
    expect(store.drafts.get('entry')?.pendingSave).toBeUndefined()
    const restored = create('Remote', 'remote-sha')
    await restored.load()
    expect(restored.getSnapshot()).toMatchObject({
      value: 'Combined',
      base: { value: 'Remote' },
      baseSha: 'remote-sha',
    })
    await restored.discard()
    expect(restored.getSnapshot()).toMatchObject({
      value: 'Remote',
      dirty: false,
    })
    expect(store.drafts.size).toBe(0)
  })
  it('clears the local draft when the GitHub version is chosen unchanged', async () => {
    const session = create()
    await session.load()
    session.setValue('Local')
    await session.flush()
    await session.applyMerge('Remote', 'Remote', 'remote-sha')
    expect(session.getSnapshot()).toMatchObject({
      value: 'Remote',
      dirty: false,
      baseSha: 'remote-sha',
    })
    expect(store.drafts.size).toBe(0)
  })
  it('preserves another tab’s draft if it changes during merge review', async () => {
    const session = create()
    await session.load()
    session.setValue('Local')
    await session.flush()
    const current = store.drafts.get('entry')!
    store.drafts.set('entry', {
      ...current,
      revision: current.revision + 1,
      value: 'Other tab',
    })
    await expect(
      session.applyMerge('Combined', 'Remote', 'remote-sha'),
    ).rejects.toThrow('Draft changed')
    expect(store.drafts.get('entry')?.value).toBe('Other tab')
    expect(session.getSnapshot().value).toBe('Combined')
    expect(session.getSnapshot().error).toBeInstanceOf(Error)
  })
  it('acknowledges undoing to an already persisted draft without another write', async () => {
    const session = create()
    await session.load()
    session.setValue('Persisted edit')
    await session.flush()
    const revision = store.drafts.get('entry')?.revision
    session.setValue('Temporary edit')
    session.setValue('Persisted edit')
    await session.flush()
    expect(session.getSnapshot()).toMatchObject({
      dirty: true,
      status: 'Saved on this device',
    })
    expect(store.drafts.get('entry')?.revision).toBe(revision)
  })

  it('clears the saved acknowledgement immediately when the draft changes again', async () => {
    const session = create()
    await session.load()
    session.setValue('First edit')
    await session.flush()
    expect(session.getSnapshot().status).toBe('Saved on this device')
    session.setValue('Second edit')
    expect(session.getSnapshot()).toMatchObject({ dirty: true, status: '' })
    await session.flush()
    expect(session.getSnapshot().status).toBe('Saved on this device')
  })

  it('clears the loading message once an empty local draft lookup completes', async () => {
    const session = create()
    expect(session.getSnapshot()).toMatchObject({
      ready: false,
      status: 'Loading local draft…',
    })
    await session.load()
    expect(session.getSnapshot()).toMatchObject({
      ready: true,
      status: '',
      error: null,
      dirty: false,
    })
  })
  it('keeps the restoration message when a local draft was recovered', async () => {
    store.drafts.set('entry', {
      key: 'entry',
      schema: 'schema',
      baseSha: 'original-sha',
      base: { value: 'Original' },
      revision: 1,
      value: 'Recovered',
    })
    const session = create()
    await session.load()
    expect(session.getSnapshot()).toMatchObject({
      ready: true,
      value: 'Recovered',
      status: 'Restored draft saved on this device',
      dirty: true,
    })
  })

  it('flushes navigation edits before the debounce expires', async () => {
    const session = create()
    await session.load()
    session.setValue('Just typed')
    await session.flush()
    expect(store.drafts.get('entry')?.value).toBe('Just typed')
  })
  it('does not advance draft revisions when navigation flushes unchanged content', async () => {
    const session = create()
    await session.load()
    session.setValue('Dirty')
    await session.flush()
    const revision = store.drafts.get('entry')?.revision
    await session.flush()
    const unmount = session.mount()
    unmount()
    await session.flush()
    expect(store.drafts.get('entry')?.revision).toBe(revision)
  })
  it('retains later typing after the editor unmounts and rebases it immediately', async () => {
    const dispose = vi.fn()
    const session = create('Original', 'original-sha', dispose)
    const unmount = session.mount()
    await session.load()
    session.setValue('Submitted')
    const release = session.retain()
    await session.beginSave('Submitted')
    session.setValue('Newer edit')
    await session.flush()
    unmount()
    expect(dispose).not.toHaveBeenCalled()
    await session.acknowledge('Submitted', 'Submitted', 'saved-sha')
    expect(session.getSnapshot()).toMatchObject({
      value: 'Newer edit',
      baseline: 'Submitted',
      baseSha: 'saved-sha',
      dirty: true,
      pending: 1,
    })
    expect(store.drafts.get('entry')).toMatchObject({
      value: 'Newer edit',
      baseSha: 'saved-sha',
    })
    expect(store.drafts.get('entry')?.pendingSave).toBeUndefined()
    release()
    expect(dispose).toHaveBeenCalled()
  })
  it('uses the canonical response only when no newer edit exists', async () => {
    const session = create()
    await session.load()
    session.setValue('Submitted')
    await session.beginSave('Submitted')
    await session.acknowledge('Submitted', 'Canonical', 'saved-sha')
    expect(session.getSnapshot()).toMatchObject({
      value: 'Canonical',
      baseline: 'Canonical',
      dirty: false,
      baseSha: 'saved-sha',
    })
    expect(store.drafts.size).toBe(0)
  })
  it('never overwrites another tab during acknowledgement', async () => {
    const session = create()
    await session.load()
    session.setValue('Submitted')
    await session.beginSave('Submitted')
    const current = store.drafts.get('entry')!
    store.drafts.set('entry', {
      ...current,
      revision: current.revision + 1,
      value: 'Other tab edit',
    })
    session.setValue('My later edit')
    await session.acknowledge('Submitted', 'Submitted', 'saved-sha')
    expect(store.drafts.get('entry')?.value).toBe('Other tab edit')
    expect(session.getSnapshot()).toMatchObject({
      value: 'My later edit',
      baseSha: 'saved-sha',
      dirty: true,
    })
    expect(session.getSnapshot().error).toBeInstanceOf(Error)
  })
  it('rebases an interrupted save only when fresh server content proves it committed', async () => {
    const first = create()
    await first.load()
    first.setValue('Submitted')
    await first.beginSave('Submitted')
    first.setValue('Later')
    await first.flush()
    const reloaded = create('Submitted', 'new-sha')
    await reloaded.load()
    expect(reloaded.getSnapshot()).toMatchObject({
      value: 'Later',
      baseSha: 'new-sha',
      dirty: true,
    })
    expect(store.drafts.get('entry')).toMatchObject({
      value: 'Later',
      baseSha: 'new-sha',
    })
    expect(store.drafts.get('entry')?.pendingSave).toBeUndefined()
  })
  it('retains conflict protection if a different server change exists after reload', async () => {
    const first = create()
    await first.load()
    first.setValue('Submitted')
    await first.beginSave('Submitted')
    const reloaded = create('Someone else changed it', 'other-sha')
    await reloaded.load()
    expect(reloaded.getSnapshot()).toMatchObject({
      value: 'Submitted',
      baseSha: 'original-sha',
      dirty: true,
    })
    expect(store.drafts.get('entry')?.pendingSave).toBeDefined()
  })
  it('clears only unchanged edits after a create completes off-page', async () => {
    const session = create()
    await session.load()
    session.setValue('Created')
    await session.flush()
    await session.saved('Created')
    expect(store.drafts.size).toBe(0)
    expect(session.getSnapshot().dirty).toBe(false)
  })
  it('does not recreate a draft detached by rename or delete', async () => {
    const session = create()
    await session.load()
    session.setValue('Dirty')
    await session.flush()
    session.detach()
    store.drafts.clear()
    session.setValue('Old view')
    await session.flush()
    expect(store.drafts.size).toBe(0)
  })
  it('reports a rejected discard without removing the retained draft', async () => {
    const session = create()
    await session.load()
    session.setValue('Keep this draft')
    await session.flush()
    const draft = store.drafts.get('entry')!
    store.drafts.set('entry', { ...draft, revision: draft.revision + 1 })
    await expect(session.discard()).rejects.toThrow(
      'Draft changed in another tab',
    )
    expect(store.drafts.get('entry')?.value).toBe('Keep this draft')
    expect(session.getSnapshot()).toMatchObject({
      dirty: true,
      value: 'Keep this draft',
      error: expect.any(Error),
    })
  })

  it('retains a list draft when the same fields are reconfigured as an object', async () => {
    const session = (value: unknown) =>
      new DraftSession<unknown>(
        'entry',
        'same-fields',
        summary,
        value,
        'sha',
        () => 'Entry',
        vi.fn(),
      )
    const original = session([{ title: 'Original' }])
    await original.load()
    original.setValue([{ title: 'Keep my changes' }])
    await original.flush()
    const changed = session({ title: 'Remote object' })
    await changed.load()
    expect(changed.getSnapshot()).toMatchObject({
      ready: false,
      value: [{ title: 'Keep my changes' }],
      error: expect.any(Error),
    })
    await expect(changed.flush()).rejects.toThrow(
      'The content configuration changed.',
    )
    expect(store.drafts.get('entry')?.value).toEqual([
      { title: 'Keep my changes' },
    ])
    await changed.discard()
    expect(changed.getSnapshot()).toMatchObject({
      ready: true,
      value: { title: 'Remote object' },
      dirty: false,
    })
  })

  it('retains incompatible configuration and allows explicit discard recovery', async () => {
    const first = create()
    await first.load()
    first.setValue('Dirty')
    await first.flush()
    const changed = create('Original', 'original-sha', vi.fn(), 'new-schema')
    await changed.load()
    expect(changed.getSnapshot()).toMatchObject({
      ready: false,
      value: 'Dirty',
    })
    expect(changed.getSnapshot().error).toBeInstanceOf(Error)
    await changed.discard()
    expect(changed.getSnapshot()).toMatchObject({
      ready: true,
      value: 'Original',
      dirty: false,
    })
  })
})
