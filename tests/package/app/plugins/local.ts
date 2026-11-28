import { definePlugin } from 'pagescms'

export default () =>
  definePlugin({
    id: 'local-proof',
    server: new URL('./local.server.ts', import.meta.url),
    client: new URL('./local-ui.ts', import.meta.url),
  })
