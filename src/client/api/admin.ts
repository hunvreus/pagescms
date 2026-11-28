import type {
  readAdminDashboard as dashboard,
  executeAdminAction,
  readSignInAllowlist,
  changeSignInAllowlist,
} from '#/server/services/admin'
import { apiMutation, apiQuery } from '#/client/api/index'

export const getAdminDashboard: (
  input: unknown,
) => ReturnType<typeof dashboard> = (input) =>
  apiQuery('/api/admin/dashboard', input)
export const runAdminAction = apiMutation<
  unknown,
  Awaited<ReturnType<typeof executeAdminAction>>
>('/api/admin/actions')
export const getSignInAllowlist = (input: {
  query: string
  page: number
}): ReturnType<typeof readSignInAllowlist> =>
  apiQuery('/api/admin/allowlist', input)
export const updateSignInAllowlist = apiMutation<
  unknown,
  Awaited<ReturnType<typeof changeSignInAllowlist>>
>('/api/admin/allowlist')
