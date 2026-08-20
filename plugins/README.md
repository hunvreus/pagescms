# Plugins

Pages CMS discovers trusted, build-time plugins from immediate subdirectories of this folder. A client-safe plugin manifest lives at `plugins/<id>/plugin.ts` and must default-export a definition created with `definePlugin`.

```ts
import { definePlugin } from '#/plugins/contract'

export default definePlugin({
  apiVersion: 1,
  id: 'enterprise-access',
  name: 'Enterprise access',
})
```

Discovery is static during the Vite build. Pages CMS does not download or execute user-supplied runtime code. A plugin may optionally add a server-only `server.ts` contribution; see [`docs/development/plugins.md`](../docs/development/plugins.md) for the access-policy contract and isolation rules.
