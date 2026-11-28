import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/github/$owner/$repo/$branch/collection/$name_/edit/$',
)({
  beforeLoad: ({ params }) => {
    if (!params._splat) throw new Error('Entry path is required')
    throw redirect({
      to: '/github/$owner/$repo/$branch/collection/$name/entry/$',
      params,
    })
  },
})
