import type { RequestServices } from '#/server/context'

export function githubAppInstall(services: RequestServices) {
  const appName = services.configuration.githubAppName
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
}
