import { createFileRoute, redirect } from '@tanstack/react-router'

import { getSafeRedirect } from '#/lib/auth-redirect'

export const Route = createFileRoute('/auth/redirect')({
  validateSearch: (search: Record<string, unknown>) => ({
    to: typeof search.to === 'string' ? search.to : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ href: getSafeRedirect(search.to), replace: true })
  },
})
