import type { ServerPluginModule } from 'pagescms'

const plugin: ServerPluginModule = () => ({
  id: 'local-proof',
  create: () => ({
    routes: [
      {
        method: 'GET',
        path: 'typed',
        access: 'public',
        handle: async () => Response.json({ typed: true }),
      },
    ],
  }),
})
export default plugin
