import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/$owner/$repo/$branch/collection/$name/new',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$owner/$repo/$branch/collection/$name',
      params,
      search: { create: true },
    })
  },
})
