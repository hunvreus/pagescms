import type { Plugin } from 'vite'

export function cloudflareProjectRoutes(): Plugin {
  return {
    name: 'pagescms:cloudflare-project-routes',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_redirects',
        source: '/github/* / 200\n',
      })
    },
  }
}
