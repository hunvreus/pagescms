export interface DraftTarget {
  owner: string
  repo: string
  branch: string
  name: string
  path?: string
  parent?: string
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
  value: T
  pendingSave?: { value: T; baseSha: string | null }
  summary?: EntrySummary
}

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pagescms-content-drafts', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('drafts'))
        db.createObjectStore('drafts', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('recent'))
        db.createObjectStore('recent', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close()
        database = undefined
      }
      resolve(request.result)
    }
    request.onerror = () => {
      database = undefined
      reject(request.error)
    }
  }))
}

export async function readDraft<T>(
  key: string,
): Promise<ContentDraft<T> | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(key)
    request.onsuccess = () =>
      resolve(request.result as ContentDraft<T> | undefined)
    request.onerror = () => reject(request.error)
  })
}

// The revision check and mutation share one transaction, preventing another tab's draft from being overwritten.
export async function writeDraft<T>(
  draft: Omit<ContentDraft<T>, 'revision'>,
  revision: number,
): Promise<number> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite')
    const store = transaction.objectStore('drafts')
    const request = store.get(draft.key)
    let conflict = false
    request.onsuccess = () => {
      const existing = request.result as ContentDraft | undefined
      if ((existing?.revision ?? 0) !== revision) {
        conflict = true
        transaction.abort()
        return
      }
      store.put({ ...draft, revision: revision + 1 })
    }
    transaction.oncomplete = () => {
      window.dispatchEvent(new Event('pagescms:drafts'))
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
    const transaction = db.transaction('drafts', 'readwrite')
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
    }
    transaction.oncomplete = () => {
      window.dispatchEvent(new Event('pagescms:drafts'))
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

export type ListedDraft = ContentDraft & { summary: EntrySummary }
function matches(
  summary: EntrySummary,
  account: string,
  target: Pick<DraftTarget, 'owner' | 'repo' | 'branch'>,
) {
  return (
    summary.account === account &&
    summary.target.owner.toLowerCase() === target.owner.toLowerCase() &&
    summary.target.repo.toLowerCase() === target.repo.toLowerCase() &&
    summary.target.branch === target.branch
  )
}
export async function listDrafts(
  account: string,
  target: Pick<DraftTarget, 'owner' | 'repo' | 'branch'>,
): Promise<ListedDraft[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').getAll()
    request.onsuccess = () =>
      resolve(
        (request.result as ContentDraft[])
          .filter((draft): draft is ListedDraft =>
            Boolean(draft.summary && matches(draft.summary, account, target)),
          )
          .sort((a, b) => b.summary.updatedAt - a.summary.updatedAt),
      )
    request.onerror = () => reject(request.error)
  })
}
export async function recordOpened(entry: EntrySummary): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('recent', 'readwrite')
    const store = transaction.objectStore('recent')
    store.put(entry)
    const request = store.getAll()
    request.onsuccess = () => {
      const entries = (request.result as EntrySummary[])
        .filter(
          (candidate) =>
            candidate.source === entry.source &&
            matches(candidate, entry.account, entry.target),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key))
      for (const candidate of entries.slice(50)) store.delete(candidate.key)
    }
    transaction.oncomplete = () => {
      window.dispatchEvent(new Event('pagescms:drafts'))
      resolve()
    }
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
  })
}
export async function recentEntries(
  account: string,
  target: Pick<DraftTarget, 'owner' | 'repo' | 'branch'>,
  source?: string,
): Promise<EntrySummary[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('recent').objectStore('recent').getAll()
    request.onsuccess = () =>
      resolve(
        (request.result as EntrySummary[])
          .filter(
            (entry) =>
              matches(entry, account, target) &&
              (!source || entry.source === source),
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 10),
      )
    request.onerror = () => reject(request.error)
  })
}

export function contentDraftKey(
  account: string,
  source: string,
  target: DraftTarget,
  creationId?: string,
) {
  return JSON.stringify([
    account,
    source,
    target.owner.toLowerCase(),
    target.repo.toLowerCase(),
    target.branch,
    target.name,
    target.path ?? null,
    target.parent ?? null,
    ...(target.path ? [] : [creationId]),
    ...(target.kind ? [target.kind] : []),
  ])
}

export async function relocateEntryDraft(
  key: string,
  revision: number,
  newPath: string,
  sha: string,
) {
  const db = await openDatabase()
  const parts = JSON.parse(key) as unknown[]
  parts[6] = newPath
  const nextKey = JSON.stringify(parts)
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'recent'], 'readwrite')
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
          drafts.put({
            ...draft,
            key: nextKey,
            baseSha: sha,
            revision: 1,
            pendingSave: undefined,
            summary: draft.summary ? relocate(draft.summary) : undefined,
          })
          drafts.delete(key)
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
      window.dispatchEvent(new Event('pagescms:drafts'))
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
    const transaction = db.transaction(['drafts', 'recent'], 'readwrite')
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
      transaction.objectStore('recent').delete(key)
    }
    transaction.oncomplete = () => {
      window.dispatchEvent(new Event('pagescms:drafts'))
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
