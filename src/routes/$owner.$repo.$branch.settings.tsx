import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$owner/$repo/$branch/settings')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$owner/$repo/$branch/configuration',
      params,
      replace: true,
    })
  },
})
