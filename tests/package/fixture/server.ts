import type { ServerPluginModule } from '#/package/runtime.server'

const plugin: ServerPluginModule = (options, { publicOptions, target }) => ({
  id: 'fixture',
  create: (environment) => ({
    ...(options.email
      ? { emailProvider: { send: async () => undefined } }
      : {}),
    routes: [
      {
        method: 'GET',
        path: 'echo',
        access: 'public',
        handle: async () =>
          Response.json({ options, publicOptions, target, environment }),
      },
    ],
  }),
})

export default plugin
