import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { configuredIconDirectory } from './icon-path'
import type { Plugin } from 'vite'

const prefix = '/configured-icons/'
const iconName = /^[A-Z][A-Za-z0-9]*Icon$/

async function icon(name: string) {
  const path = join(configuredIconDirectory(), `${name}.js`)
  try {
    return (await import(pathToFileURL(path).href)).default as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND')
      return undefined
    throw error
  }
}

export function configuredIcons(): Plugin {
  return {
    name: 'pagescms:configured-icons',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = (request.url ?? '').split('?')[0] ?? ''
        if (!path.startsWith(prefix)) return next()
        const name = path.slice(prefix.length).replace(/\.json$/, '')
        if (!path.endsWith('.json') || !iconName.test(name)) {
          response.statusCode = 404
          return response.end()
        }
        try {
          const value = await icon(name)
          if (!value) response.statusCode = 404
          else response.setHeader('Content-Type', 'application/json')
          return response.end(value ? JSON.stringify(value) : '')
        } catch (error) {
          return next(error)
        }
      })
    },
    async generateBundle() {
      if (this.environment.name !== 'client') return
      for (const file of await readdir(configuredIconDirectory())) {
        if (!file.endsWith('Icon.js')) continue
        const name = file.slice(0, -3)
        if (!iconName.test(name)) continue
        const value = await icon(name)
        this.emitFile({
          type: 'asset',
          fileName: `configured-icons/${name}.json`,
          source: JSON.stringify(value),
        })
      }
    },
  }
}
