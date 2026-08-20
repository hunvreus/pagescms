import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/github-app/install')({
  server: {
    handlers: {
      GET: ({ context }) => {
        const appName = context.getServices().configuration.githubAppName
        if (!appName) {
          return Response.json(
            { error: 'GitHub App installation is not configured' },
            { status: 503 },
          )
        }
        return Response.redirect(
          `https://github.com/apps/${encodeURIComponent(appName)}/installations/new`,
          302,
        )
      },
    },
  },
})
