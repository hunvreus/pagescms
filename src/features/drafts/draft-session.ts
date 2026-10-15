import {
  discardDraft,
  readDraft,
  recordOpened,
  writeDraft,
} from './draft-store'
import type { ContentDraft, EntrySummary } from './draft-store'
import { equalMergeValue } from './merge-draft'

export function sameDraftValue(a: unknown, b: unknown) {
  return equalMergeValue(a, b)
}

export interface DraftState<T> {
  value: T
  // Latest loaded or confirmed values, used for dirty checks and discard.
  baseline: T
  baseSha: string | null
  // Original values at baseSha; these can predate the latest loaded version.
  base?: { value: T }
  ready: boolean
  dirty: boolean
  pending: number
  error: unknown
  status: string
  savedAt: number | null
}

// Kept alive by the editor or a mutation, so acknowledgement still owns the
// latest edits when the editor unmounts or is reopened during the request.
export class DraftSession<T> {
  private listeners = new Set<() => void>()
  private chain: Promise<unknown> = Promise.resolve()
  private loading?: Promise<void>
  private revision = 0
  private persisted?: string
  private attempt?: ContentDraft<T>['pendingSave']
  private confirmedSha: string | null
  private owners = 0
  private timer?: ReturnType<typeof setTimeout>
  private detached = false
  private state: DraftState<T>

  constructor(
    readonly key: string,
    readonly schema: string,
    readonly summary: EntrySummary,
    value: T,
    sha: string | null,
    private title: (value: T) => string,
    private dispose: () => void,
  ) {
    this.confirmedSha = sha
    this.state = {
      value,
      baseline: value,
      baseSha: sha,
      base: { value },
      ready: false,
      dirty: false,
      pending: 0,
      error: null,
      status: 'Loading local draft…',
      savedAt: null,
    }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private set(next: Partial<DraftState<T>>) {
    this.state = { ...this.state, ...next }
    this.state.dirty = !sameDraftValue(this.state.value, this.state.baseline)
    for (const listener of this.listeners) listener()
  }
  private report(error: unknown) {
    this.set({ error, status: 'Could not save locally — keep this tab open' })
  }
  private enqueue(action: () => Promise<void>) {
    const task = this.chain.catch(() => {}).then(action)
    this.chain = task
    return task.catch((error: unknown) => {
      this.report(error)
      throw error
    })
  }
  private removeIfUnused() {
    if (!this.owners && !this.state.pending && !this.state.error) this.dispose()
  }
  mount() {
    this.owners++
    void this.load()
    return () => {
      this.owners--
      void this.flush()
        .then(() => this.removeIfUnused())
        .catch(() => {})
    }
  }
  retain() {
    this.set({ pending: this.state.pending + 1 })
    return () => {
      this.set({ pending: this.state.pending - 1 })
      this.removeIfUnused()
    }
  }
  load() {
    return (this.loading ??= readDraft<T>(this.key)
      .then(async (draft) => {
        if (draft) {
          this.revision = draft.revision
          this.set({ savedAt: draft.summary?.updatedAt ?? null })
          this.persisted = JSON.stringify([
            draft.schema,
            draft.baseSha,
            draft.base,
            draft.value,
            draft.pendingSave,
          ])
          if (draft.schema !== this.schema) {
            this.set({
              value: draft.value,
              error: new Error(
                'The content configuration changed. Your local draft is retained; restore the previous configuration before reopening it.',
              ),
              status: 'Local draft unavailable — keep this tab open',
            })
            return
          }
          this.attempt = draft.pendingSave
          this.set({
            value: draft.value,
            baseSha: draft.baseSha,
            base:
              draft.base ??
              (draft.baseSha === this.confirmedSha
                ? { value: this.state.baseline }
                : undefined),
            status: 'Restored draft saved on this device',
          })
          // A reload lost the running request, but the fresh server value proves
          // that its submitted snapshot was committed. Rebase only that case.
          if (
            this.attempt &&
            this.confirmedSha !== this.attempt.baseSha &&
            sameDraftValue(this.state.baseline, this.attempt.value)
          ) {
            this.attempt = undefined
            this.set({
              baseSha: this.confirmedSha,
              base: { value: this.state.baseline },
            })
            await this.persist()
          }
        }
        this.set({ ready: true, status: draft ? this.state.status : '' })
        if (this.summary.target.path)
          void recordOpened(this.summary).catch(() => {})
      })
      .catch((error: unknown) => {
        this.set({
          ready: true,
          error,
          status: 'Local draft unavailable — keep this tab open',
        })
      }))
  }
  setValue = (value: T | ((current: T) => T)) => {
    const next =
      typeof value === 'function'
        ? (value as (current: T) => T)(this.state.value)
        : value
    this.set({ value: next, status: '' })
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {})
    }, 350)
  }
  private async persist() {
    if (this.detached || (!this.state.ready && this.state.error)) return
    if (!this.state.dirty && !this.attempt) {
      if (this.revision) await discardDraft(this.key, this.revision)
      this.revision = 0
      this.persisted = undefined
      this.set({ status: '', error: null, savedAt: null })
      return
    }
    const fingerprint = JSON.stringify([
      this.schema,
      this.state.baseSha,
      this.state.base,
      this.state.value,
      this.attempt,
    ])
    if (fingerprint === this.persisted) {
      if (!this.state.error) this.set({ status: 'Saved on this device' })
      return
    }
    const snapshot = {
      key: this.key,
      schema: this.schema,
      baseSha: this.state.baseSha,
      base: this.state.base,
      value: this.state.value,
      summary: {
        ...this.summary,
        title: this.title(this.state.value),
        updatedAt: Date.now(),
      },
      ...(this.attempt ? { pendingSave: this.attempt } : {}),
    }
    this.revision = await writeDraft(snapshot, this.revision)
    this.persisted = fingerprint
    this.set({
      status: 'Saved on this device',
      error: null,
      savedAt: snapshot.summary.updatedAt,
    })
  }
  async flush() {
    clearTimeout(this.timer)
    await this.load()
    await this.enqueue(() => this.persist())
  }
  async beginSave(submitted: T) {
    await this.load()
    this.attempt = { value: submitted, baseSha: this.state.baseSha }
    await this.flush()
  }
  async acknowledge(submitted: T, persisted: T, sha: string) {
    clearTimeout(this.timer)
    await this.enqueue(async () => {
      this.confirmedSha = sha
      this.attempt = undefined
      this.set({
        baseline: persisted,
        base: { value: persisted },
        baseSha: sha,
        ...(sameDraftValue(this.state.value, submitted)
          ? { value: persisted }
          : {}),
      })
      await this.persist()
      if (this.summary.target.path)
        await recordOpened({
          ...this.summary,
          title: this.title(persisted),
          updatedAt: Date.now(),
        })
    }).catch(() => {})
  }
  async saved(submitted: T) {
    await this.enqueue(async () => {
      if (!sameDraftValue(this.state.value, submitted)) return
      this.attempt = undefined
      this.set({ baseline: submitted, base: { value: submitted } })
      await this.persist()
    }).catch(() => {})
  }
  async discard() {
    clearTimeout(this.timer)
    await this.enqueue(async () => {
      await discardDraft(this.key, this.revision)
      this.revision = 0
      this.persisted = undefined
      this.attempt = undefined
      this.set({
        value: this.state.baseline,
        baseSha: this.confirmedSha,
        base: { value: this.state.baseline },
        error: null,
        status: '',
        savedAt: null,
        ready: true,
      })
    }).catch(() => {})
  }
  async applyMerge(value: T, latest: T, sha: string | null) {
    clearTimeout(this.timer)
    await this.enqueue(async () => {
      this.confirmedSha = sha
      this.attempt = undefined
      this.set({
        value,
        baseline: latest,
        base: { value: latest },
        baseSha: sha,
      })
      await this.persist()
    })
  }
  detach() {
    clearTimeout(this.timer)
    this.detached = true
  }
  localError(error: unknown) {
    this.report(error)
  }
  download = () =>
    downloadDraft({
      key: this.key,
      schema: this.schema,
      baseSha: this.state.baseSha,
      value: this.state.value,
    })
}

export function downloadDraft(draft: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'content-draft.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
