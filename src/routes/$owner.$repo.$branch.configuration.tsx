import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$owner/$repo/$branch/configuration')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$owner/$repo/$branch/settings',
      params,
      search: { edit: 'configuration' },
      replace: true,
    })
  },
})
