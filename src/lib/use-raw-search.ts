import { useLocation, useRouter } from '@tanstack/react-router'

/** Preserve repeated parameters and exact values in externally signed queries. */
export function useRawSearch() {
  const router = useRouter()
  return useLocation({
    select: () => router.history.location.search.slice(1),
  })
}
