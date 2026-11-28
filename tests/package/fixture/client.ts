import type { ClientPluginModule } from '#/package/runtime'

const client: ClientPluginModule = () => ({
  fields: {
    'fixture-text': { editor: () => import('./editor') },
  },
})

export default client
