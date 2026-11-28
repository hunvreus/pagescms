import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

/** Clearing a boundary alone rethrows the cached loader error. */
export function useRouteRetry(reset: () => void) {
  const router = useRouter()
  const { reset: resetQueries } = useQueryErrorResetBoundary()
  const [retrying, setRetrying] = useState(false)
  async function retry() {
    if (retrying) return
    setRetrying(true)
    try {
      await router.invalidate({
        filter: (match) => match.status === 'error',
        sync: true,
      })
    } catch (error) {
      console.warn('Route retry failed', error)
    } finally {
      resetQueries()
      reset()
      setRetrying(false)
    }
  }
  return { retry, retrying }
}
