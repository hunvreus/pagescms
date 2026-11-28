import type { DBAdapter, DBTransactionAdapter } from 'better-auth'
import { decryptOAuthToken } from '#/server/auth/oauth-token-crypto'

// Account hooks encrypt every token Better Auth writes; reads decrypt them so
// Better Auth only ever sees plaintext. Any other stored format is rejected.
export function withOAuthTokenReads(
  adapter: DBAdapter,
  secret: string,
): DBAdapter {
  async function decryptRecord<T>(row: T): Promise<T> {
    if (!row || typeof row !== 'object') return row
    const record = row as Record<string, unknown>
    async function decrypt(value: unknown) {
      if (typeof value !== 'string' || !value) return value
      return decryptOAuthToken(value, secret)
    }
    const [accessToken, refreshToken] = await Promise.all([
      decrypt(record.accessToken),
      decrypt(record.refreshToken),
    ])
    return {
      ...record,
      ...('accessToken' in record ? { accessToken } : {}),
      ...('refreshToken' in record ? { refreshToken } : {}),
    } as T
  }

  function wrap<T extends DBTransactionAdapter>(source: T): T {
    return {
      ...source,
      async findOne<TRecord>(query: Parameters<DBAdapter['findOne']>[0]) {
        const row = await source.findOne<TRecord>(query)
        return query.model === 'account' ? decryptRecord(row) : row
      },
      async findMany<TRecord>(query: Parameters<DBAdapter['findMany']>[0]) {
        const rows = await source.findMany<TRecord>(query)
        return query.model === 'account'
          ? Promise.all(rows.map(decryptRecord))
          : rows
      },
    }
  }
  return {
    ...wrap(adapter),
    transaction: (callback) =>
      adapter.transaction((transaction) => callback(wrap(transaction))),
  }
}
