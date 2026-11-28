export const LOCAL_ACCOUNTS_KEY = 'pagescms:local-accounts'
export const DELETED_ACCOUNTS_KEY = 'pagescms:deleted-accounts'

export function localAccountReceipts(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(LOCAL_ACCOUNTS_KEY) ?? '{}',
    )
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        ([account, receipt]) =>
          account.length > 0 &&
          typeof receipt === 'string' &&
          receipt.length <= 1024,
      ),
    )
  } catch {
    return {}
  }
}

export function rememberLocalAccount(account: string, receipt: string) {
  try {
    const accounts = localAccountReceipts()
    if (accounts[account] === receipt) return
    accounts[account] = receipt
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))
  } catch {
    // Optional storage must not prevent signing in.
  }
}

export function deletedAccounts(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(DELETED_ACCOUNTS_KEY) ?? '[]',
    )
    return Array.isArray(value)
      ? value.filter(
          (account): account is string => typeof account === 'string',
        )
      : []
  } catch {
    return []
  }
}

export function accountWasDeleted(account: string) {
  return deletedAccounts().includes(account)
}

export function forgetDeletedAccount(account: string) {
  localStorage.setItem(
    DELETED_ACCOUNTS_KEY,
    JSON.stringify(deletedAccounts().filter((value) => value !== account)),
  )
}

export async function clearDeletedAccountData(account: string) {
  try {
    localStorage.setItem(
      DELETED_ACCOUNTS_KEY,
      JSON.stringify([...new Set([...deletedAccounts(), account])]),
    )
    localStorage.removeItem(`latestVisits:${account}`)
    const { clearTranslationPreferences } =
      await import('#/features/editor/translation-preferences')
    clearTranslationPreferences(account)
  } catch {
    // IndexedDB may remain available when localStorage is disabled.
  }
  const { clearAccountDrafts } = await import('#/features/drafts/draft-store')
  await clearAccountDrafts(account)
  try {
    const accounts = localAccountReceipts()
    delete accounts[account]
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))
  } catch {
    // Retaining a receipt is harmless; a later sweep retries the cleanup.
  }
}
