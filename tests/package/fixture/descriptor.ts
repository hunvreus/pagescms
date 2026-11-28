import { definePlugin } from '#/package/config'
import type { JsonObject } from '#/shared/json'

// Descriptor modules are pure data: no runtime imports.
export default function fixturePlugin(input: {
  options?: JsonObject
  publicOptions?: JsonObject
}) {
  return definePlugin({
    id: 'fixture',
    server: new URL('./server.ts', import.meta.url),
    shared: new URL('./shared.ts', import.meta.url),
    client: new URL('./client.ts', import.meta.url),
    ...input,
  })
}
