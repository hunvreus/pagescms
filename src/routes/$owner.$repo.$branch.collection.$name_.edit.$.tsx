import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/$owner/$repo/$branch/collection/$name_/edit/$',
)({
  beforeLoad: ({ params }) => {
    if (!params._splat) throw new Error('Entry path is required')
    throw redirect({
      to: '/$owner/$repo/$branch/collection/$name/entry/$',
      params,
    })
  },
})
