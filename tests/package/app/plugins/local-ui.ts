import type { ClientPluginModule } from 'pagescms'

const plugin: ClientPluginModule = () => ({
  ui: {
    accountSettings: [
      {
        id: 'proof-account',
        label: 'Proof account',
        load: () => import('./account.mjs'),
      },
    ],
  },
})

export default plugin
