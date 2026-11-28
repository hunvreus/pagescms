import {
  canonicalRepositoryHref,
  knownRepositoryIdentity,
} from '#/lib/repository-identity'
import {
  connectDraftReadCache,
  draftReadCache,
  publishDraftChange,
} from './draft-read-cache'
import { accountWasDeleted } from '#/features/account/local-account-storage'

function draftAccount(key: string) {
  try {
    const value: unknown = JSON.parse(key)
    return Array.isArray(value) && typeof value[0] === 'string'
      ? value[0]
      : undefined
  } catch {
    return undefined
  }
}

function assertDraftAccount(key: string) {
  const account = draftAccount(key)
  if (account && accountWasDeleted(account))
    throw new Error(
      'This account was deleted. Its local drafts cannot be saved.',
    )
}

export async function clearAccountDrafts(account: string) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      ['drafts', 'recent', 'summaries'],
      'readwrite',
    )
    const removed: string[] = []
    for (const name of ['drafts', 'recent', 'summaries']) {
      const request = transaction.objectStore(name).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const value = cursor.value as ContentDraft & Partial<EntrySummary>
        if (
          draftAccount(String(cursor.key)) === account ||
          value.account === account ||
          value.summary?.account === account
        ) {
          removed.push(String(cursor.key))
          cursor.delete()
        }
        cursor.continue()
      }
    }
    transaction.oncomplete = () => {
      publishDraftChange(removed)
      resolve()
    }
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
  })
}

export interface DraftTarget {
  repoId?: string
  owner: string
  repo: string
  branch: string
  name: string
  path?: string
  parent?: string
  locale?: string
  kind?: 'configuration'
}
export interface EntrySummary {
  key: string
  account: string
  source: string
  target: DraftTarget
  title: string
  href: string
  updatedAt: number
}
export interface ContentDraft<T = unknown> {
  key: string
  revision: number
  schema: string
  baseSha: string | null
  base: { value: T }
  value: T
  pendingSave?: { value: T; baseSha: string | null }
  summary?: EntrySummary
}

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  if (database) return database
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pagescms-local-files', 1)
    const invalidate = () => {
      if (database === opening) database = undefined
      draftReadCache.invalidate()
    }
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('drafts', { keyPath: 'key' })
      const recent = db.createObjectStore('recent', { keyPath: 'key' })
      const summaries = db.createObjectStore('summaries', { keyPath: 'key' })
      const scope = ['account', 'source', 'target.repoId', 'target.branch']
      summaries.createIndex('scope', scope)
      recent.createIndex('scope', scope)
    }
    request.onsuccess = () => {
      request.result.onclose = invalidate
      request.result.onversionchange = () => {
        request.result.close()
        invalidate()
      }
      resolve(request.result)
    }
    request.onerror = () => {
      invalidate()
      reject(request.error)
    }
  })
  database = opening
  return opening
}

export async function readDraft<T>(
  key: string,
): Promise<ContentDraft<T> | undefined> {
  const account = draftAccount(key)
  if (account && accountWasDeleted(account)) return undefined
  connectDraftReadCache()
  const cached = draftReadCache.get<T>(key)
  if (cached) return cached.value
  const version = draftReadCache.version
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(key)
    request.onsuccess = () => {
      const draft = request.result as ContentDraft<T> | undefined
      if (version === draftReadCache.version) draftReadCache.set(key, draft)
      resolve(draft)
    }
    request.onerror = () => reject(request.error)
  })
}

// The revision check and mutation share one transaction, preventing another tab's draft from being overwritten.
export async function writeDraft<T>(
  draft: Omit<ContentDraft<T>, 'revision'>,
  revision: number,
): Promise<number> {
  assertDraftAccount(draft.key)
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'summaries'], 'readwrite')
    const store = transaction.objectStore('drafts')
    const request = store.get(draft.key)
    let conflict = false
    request.onsuccess = () => {
      try {
        assertDraftAccount(draft.key)
      } catch {
        transaction.abort()
        return
      }
      const existing = request.result as ContentDraft | undefined
      if ((existing?.revision ?? 0) !== revision) {
        conflict = true
        transaction.abort()
        return
      }
      store.put({ ...draft, revision: revision + 1 })
      const summaries = transaction.objectStore('summaries')
      if (draft.summary) summaries.put(draft.summary)
      else summaries.delete(draft.key)
    }
    transaction.oncomplete = () => {
      publishDraftChange([draft.key])
      draftReadCache.set(draft.key, { ...draft, revision: revision + 1 })
      resolve(revision + 1)
    }
    transaction.onabort = transaction.onerror = () =>
      reject(
        conflict
          ? new Error(
              'This draft changed in another tab. Reload before continuing.',
            )
          : transaction.error,
      )
  })
}

export async function discardDraft(
  key: string,
  revision: number,
): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'summaries'], 'readwrite')
    const store = transaction.objectStore('drafts')
    const request = store.get(key)
    let conflict = false
    request.onsuccess = () => {
      const existing = request.result as ContentDraft | undefined
      if (existing && existing.revision !== revision) {
        conflict = true
        transaction.abort()
        return
      }
      store.delete(key)
      transaction.objectStore('summaries').delete(key)
    }
    transaction.oncomplete = () => {
      publishDraftChange([key])
      draftReadCache.set(key, undefined)
      resolve()
    }
    transaction.onabort = transaction.onerror = () =>
      reject(
        conflict
          ? new Error(
              'This draft changed in another tab. Reload before continuing.',
            )
          : transaction.error,
      )
  })
}

function currentEntry(
  entry: EntrySummary,
  target: Pick<DraftTarget, 'owner' | 'repo'>,
): EntrySummary {
  const repository =
    knownRepositoryIdentity({ ...target, source: entry.source }) ?? target
  return {
    ...entry,
    href: canonicalRepositoryHref(entry.href, repository),
    target: { ...entry.target, owner: repository.owner, repo: repository.repo },
  }
}
export async function listOverviewEntries(
  store: 'summaries' | 'recent',
  account: string,
  target: Pick<DraftTarget, 'repoId' | 'owner' | 'repo' | 'branch'>,
  source: string,
): Promise<EntrySummary[]> {
  const repoId = target.repoId
  if (!repoId) return []
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(store)
      .objectStore(store)
      .index('scope')
      .getAll([account, source, repoId, target.branch])
    request.onsuccess = () => {
      const entries = (request.result as EntrySummary[])
        .map((entry) => currentEntry(entry, target))
        .sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(store === 'recent' ? entries.slice(0, 50) : entries)
    }
    request.onerror = () => reject(request.error)
  })
}
export async function recordOpened(entry: EntrySummary): Promise<void> {
  if (accountWasDeleted(entry.account)) return
  if (entry.target.kind === 'configuration' || !entry.target.repoId) return
  const scope = [
    entry.account,
    entry.source,
    entry.target.repoId,
    entry.target.branch,
  ]
  const db = await openDatabase()
  if (accountWasDeleted(entry.account)) return
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('recent', 'readwrite')
    const store = transaction.objectStore('recent')
    store.put(entry)
    const request = store.index('scope').getAll(scope)
    request.onsuccess = () => {
      const entries = (request.result as EntrySummary[]).sort(
        (a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key),
      )
      for (const candidate of entries.slice(50)) store.delete(candidate.key)
    }
    transaction.oncomplete = () => {
      window.dispatchEvent(new Event('pagescms:drafts'))
      resolve()
    }
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
  })
}
export function contentDraftKey(
  account: string,
  source: string,
  target: DraftTarget,
  creationId?: string,
) {
  if (!target.repoId)
    throw new Error('Repository identity is required for a draft')
  return JSON.stringify([
    account,
    source,
    target.repoId,
    target.branch,
    target.name,
    target.path ?? null,
    target.parent ?? null,
    ...(target.path ? [] : [creationId]),
    ...(target.kind ? [target.kind] : []),
    ...(!target.path && target.locale ? [{ locale: target.locale }] : []),
  ])
}

export async function relocateEntryDraft(
  key: string,
  revision: number,
  newPath: string,
) {
  const db = await openDatabase()
  const parts = JSON.parse(key) as unknown[]
  parts[5] = newPath
  const nextKey = JSON.stringify(parts)
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      ['drafts', 'recent', 'summaries'],
      'readwrite',
    )
    const drafts = transaction.objectStore('drafts')
    const recent = transaction.objectStore('recent')
    let conflict = false
    const source = drafts.get(key)
    source.onsuccess = () => {
      const draft = source.result as ContentDraft | undefined
      if ((draft?.revision ?? 0) !== revision) {
        conflict = true
        transaction.abort()
        return
      }
      const destination = drafts.get(nextKey)
      destination.onsuccess = () => {
        if (destination.result) {
          conflict = true
          transaction.abort()
          return
        }
        const relocate = (summary: EntrySummary) => ({
          ...summary,
          key: nextKey,
          target: { ...summary.target, path: newPath },
          href: `${summary.href.split('/entry/')[0]}/entry/${newPath.split('/').map(encodeURIComponent).join('/')}`,
          updatedAt: Date.now(),
        })
        if (draft) {
          const summary = draft.summary ? relocate(draft.summary) : undefined
          drafts.put({
            ...draft,
            key: nextKey,
            revision: 1,
            pendingSave: undefined,
            summary,
          })
          drafts.delete(key)
          const summaries = transaction.objectStore('summaries')
          summaries.delete(key)
          if (summary) summaries.put(summary)
        }
        const opened = recent.get(key)
        opened.onsuccess = () => {
          if (opened.result) {
            recent.put(relocate(opened.result as EntrySummary))
            recent.delete(key)
          }
        }
      }
    }
    transaction.oncomplete = () => {
      publishDraftChange([key, nextKey])
      resolve()
    }
    transaction.onabort = transaction.onerror = () =>
      reject(
        conflict
          ? new Error(
              'The file was renamed, but its local draft changed in another tab or the destination has a draft. The draft is retained for download.',
            )
          : transaction.error,
      )
  })
}

export async function deleteEntryDraft(key: string, revision: number) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      ['drafts', 'recent', 'summaries'],
      'readwrite',
    )
    const store = transaction.objectStore('drafts')
    let conflict = false
    const request = store.get(key)
    request.onsuccess = () => {
      const draft = request.result as ContentDraft | undefined
      if ((draft?.revision ?? 0) !== revision) {
        conflict = true
        transaction.abort()
        return
      }
      store.delete(key)
      transaction.objectStore('summaries').delete(key)
      transaction.objectStore('recent').delete(key)
    }
    transaction.oncomplete = () => {
      publishDraftChange([key])
      draftReadCache.set(key, undefined)
      resolve()
    }
    transaction.onabort = transaction.onerror = () =>
      reject(
        conflict
          ? new Error(
              'The file was deleted, but a newer local draft was retained for download.',
            )
          : transaction.error,
      )
  })
}
