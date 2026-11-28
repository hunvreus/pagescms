import { definePlugin } from 'pagescms'
export default (options = {}) =>
  definePlugin({
    id: 'proof',
    migrations: new URL('./migrations/', import.meta.url),
    server: new URL('./server.mjs', import.meta.url),
    shared: new URL('./shared.mjs', import.meta.url),
    client: new URL('./client.mjs', import.meta.url),
    options,
  })
