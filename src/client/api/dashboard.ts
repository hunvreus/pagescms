import type { dashboardData as getDashboardData } from '#/server/services/dashboard'
import { readApi } from '#/client/api/index'

export async function readDashboard(): ReturnType<typeof getDashboardData> {
  return readApi('/api/dashboard')
}
