import { logServerEvent } from './http'
import { AccessDeniedError } from './access-policy.server'
import type { AccessPolicyGateway, AccessRequest } from './access-policy.server'

// A write grant need not include read access. Merged content and editor metadata
// are returned only to readers; a post-commit policy failure must not fail the write.
export async function contentWriteResponse<
  T extends { path: string; entry: unknown },
>(
  access: Pick<AccessPolicyGateway, 'authorize'>,
  request: AccessRequest,
  result: T,
): Promise<Omit<T, 'entry'> & { entry: T['entry'] | undefined }> {
  if (!result.entry) return result
  try {
    await access.authorize({
      ...request,
      operation: 'entry.read',
      target: { ...request.target, path: result.path },
    })
    return result
  } catch (error) {
    if (!(error instanceof AccessDeniedError))
      logServerEvent('error', {
        event: 'content_write_response_read_failed',
        tenant: request.tenant.id,
        path: result.path,
        error: error instanceof Error ? error.name : 'UnknownError',
      })
    return { ...result, entry: undefined }
  }
}
