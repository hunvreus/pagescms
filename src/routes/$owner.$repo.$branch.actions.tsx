import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$owner/$repo/$branch/actions')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$owner/$repo/$branch/settings',
      params,
      hash: 'actions',
      replace: true,
    })
  },
})
