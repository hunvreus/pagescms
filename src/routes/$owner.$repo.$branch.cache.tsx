import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$owner/$repo/$branch/cache')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$owner/$repo/$branch/settings',
      params,
      hash: 'cache',
      replace: true,
    })
  },
})
