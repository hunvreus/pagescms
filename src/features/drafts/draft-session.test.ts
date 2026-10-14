import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DraftSession } from './draft-session'
import type { ContentDraft, EntrySummary } from './draft-store'

const store = vi.hoisted(() => ({
  drafts: new Map<string, ContentDraft>(),
  opened: vi.fn(),
}))
vi.mock('./draft-store', () => ({
  readDraft: async (key: string) => structuredClone(store.drafts.get(key)),
  recordOpened: store.opened,
  writeDraft: async (
    draft: Omit<ContentDraft, 'revision'>,
    revision: number,
  ) => {
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
  href: '/owner/repo/main/collection/posts/entry/content/post.md',
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
  store.drafts.clear()
  store.opened.mockReset().mockResolvedValue(undefined)
})
describe('draft session acknowledgement', () => {
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
